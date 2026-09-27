import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalKey, serializeParams } from '../params.js'
import { GEO_MODES, syncScope } from '../config.js'
import { collectMedia, saveMedia } from '../media.js'
import { stripTags } from '../text.js'
import {
  basePage,
  descendants,
  PANEL_RECIPES,
  panelsInLayout,
  isAvailableForRank
} from './recipes.js'
import { loadPackageRecipes, runPackageRecipe } from './packageRecipes.js'

const LISTING_PER = 500
const PROGRESS_INTERVAL = 1000

/**
 * Build or refresh the local database from the remote API.
 *
 * Scope, from `config`:
 *   - nothing set: the whole project
 *   - `roots`: the subtrees under those OTUs, walked down the taxonomy
 *   - `geographicAreas`: the OTUs TaxonWorks finds recorded in those areas;
 *     with `roots` as well, only those within the subtrees
 *   - `includeAncestors`: also the ancestors of every OTU above, so their
 *     breadcrumb links have a page
 *
 * A run can be interrupted and resumed: OTUs finished in the current run are
 * skipped, and responses already stored in it are read back instead of
 * fetched again. A new run starts when the previous one completed, when the
 * scope changes, or when `fresh` is set.
 *
 * @param {object} options
 * @param {ReturnType<import('../config.js').resolveOfflineConfig>} options.config
 * @param {import('../store.js').OfflineStore} options.store
 * @param {import('../remote.js').RemoteClient} options.remote
 * @param {object} options.configuration - Site configuration (for locales)
 * @param {string} options.packageRoot - TaxonPages package, for its i18n helpers
 * @param {string} options.projectRoot - The site, for recipes its packages ship
 * @param {boolean} [options.fresh]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: SyncProgress) => void} [options.onProgress]
 * @param {{ info: Function, warn: Function, error: Function }} [options.logger]
 * @returns {Promise<SyncProgress>}
 */
export async function runSync({
  config,
  store,
  remote,
  configuration,
  packageRoot,
  projectRoot,
  fresh = false,
  signal,
  onProgress = () => {},
  logger = console
}) {
  const scope = syncScope(config)
  const run = startRun(store, scope, fresh)
  const localizeBind = await makeBindLocalizer(packageRoot, configuration)
  const layout = config.layout || (await loadDefaultLayout(packageRoot))
  const packageRecipes = await loadPackageRecipes({ projectRoot, packageRoot, configuration, logger })
  const panels = panelsInLayout(
    layout,
    localizeBind,
    Object.fromEntries([...packageRecipes.panels].map(([id, { rankGroup }]) => [id, rankGroup]))
  )

  logPackageRecipes(packageRecipes, logger)

  const progress = {
    run,
    phase: 'starting',
    scope,
    queued: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    requests: 0,
    media: 0,
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  }

  let lastReport = 0
  const report = (force = false) => {
    progress.requests = remote.requestCount
    const now = Date.now()
    if (!force && now - lastReport < PROGRESS_INTERVAL) return
    lastReport = now
    store.setMeta('sync.progress', progress)
    onProgress({ ...progress })
  }

  const ctxBase = createFetchContext({ config, store, remote, run, progress, logger })

  // --- project-wide data ---
  progress.phase = 'project'
  report(true)

  const listedOtuIds = await syncProjectData({
    ctx: ctxBase,
    config,
    store,
    remote,
    run,
    logger,
    signal,
    onPage: () => report(),
    packageRecipes
  })

  if (signal?.aborted) return finish()

  // --- OTU pages ---
  progress.phase = 'otus'

  // Each queued OTU either walks down to its children (subtree scope) or
  // stands alone (listed by area or project, or an ancestor).
  const queue = []
  const walks = new Map()
  const enqueue = (id, { walk = false } = {}) => {
    if (walks.has(id)) return
    walks.set(id, walk)
    queue.push(id)
    progress.queued = walks.size
  }

  const walkTree = config.roots.length > 0 && config.geographicAreas.length === 0

  if (walkTree) config.roots.forEach((id) => enqueue(id, { walk: true }))
  else listedOtuIds.forEach((id) => enqueue(id))

  /** Queue what an OTU leads to: its children when walking, its ancestors when asked. */
  async function expand(ctx, otu) {
    if (walks.get(ctx.otuId)) {
      for (const id of await descendants(ctx)) enqueue(id, { walk: true })
    }

    if (config.includeAncestors && otu) {
      for (const id of ancestorIds(otu)) enqueue(id)
    }
  }

  async function processOtu(otuId) {
    const ctx = { ...ctxBase, otuId }

    if (store.isOtuDone(otuId, run)) {
      progress.skipped += 1
      const stored = await ctx.get(`/otus/${otuId}`, { extend: ['parents'] })
      await expand(ctx, stored.data)
      return
    }

    progress.current = otuId

    try {
      const { otu, taxon } = await basePage(ctx)

      if (!otu) throw new Error('OTU not found')

      // Before the panels: a failing panel must not cut off the subtree.
      await expand(ctx, otu)
      await descendants(ctx)

      const { parents, ...record } = otu
      store.putOtu(record, otuSearchText(record))

      ctx.otu = otu
      ctx.taxon = taxon
      ctx.taxonId = taxon?.id ?? otu.taxon_name_id ?? null
      ctx.rankString = taxon?.rank_string

      if (taxon) {
        for (const [panelId, entries] of panels) {
          // A package's recipe wins over the core's for the same id, as a
          // local panel wins over a core panel on the page.
          const fromPackage = packageRecipes.panels.get(panelId)
          const recipe = fromPackage
            ? (...args) => runPackageRecipe(fromPackage, ...args)
            : PANEL_RECIPES[panelId]
          if (!recipe) continue

          const binds = entries
            .filter((entry) => isAvailableForRank(entry.rankGroups, ctx.rankString))
            .map((entry) => entry.bind)

          if (binds.length) await recipe(ctx, binds)
        }
      }

      for (const entry of packageRecipes.everyOtu) {
        await runPackageRecipe(entry, ctx, [])
      }

      store.markOtu(otuId, run)
      progress.done += 1
    } catch (err) {
      store.markOtu(otuId, run, err.message || String(err))
      progress.failed += 1
      logger.warn(`OTU ${otuId}: ${err.message}`)
    }

    report()
  }

  // Workers pull from a queue that grows as subtrees are discovered. A worker
  // that finds it empty waits while others are still busy, since they may be
  // about to add children.
  let active = 0
  async function worker() {
    for (;;) {
      if (signal?.aborted) return

      const next = queue.shift()
      if (next === undefined) {
        if (active === 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
        continue
      }

      active += 1
      try {
        await processOtu(next)
      } finally {
        active -= 1
      }
    }
  }

  await Promise.all(Array.from({ length: config.sync.concurrency }, worker))

  return finish()

  function finish() {
    progress.current = null
    progress.phase = signal?.aborted ? 'interrupted' : 'completed'
    progress.finishedAt = new Date().toISOString()

    if (!signal?.aborted) {
      store.setMeta('sync.run', { ...store.getMeta('sync.run'), completedAt: progress.finishedAt })
    }

    report(true)

    return progress
  }
}

/**
 * @typedef {object} SyncProgress
 * @property {number} run
 * @property {string} phase - starting | project | otus | completed | interrupted
 * @property {ReturnType<typeof syncScope>} scope
 * @property {number} queued
 * @property {number} done
 * @property {number} skipped
 * @property {number} failed
 * @property {number} requests
 * @property {number} media
 * @property {number|null} current
 * @property {string} startedAt
 * @property {string|null} finishedAt
 */

/**
 * Continue the current run, or start a new one.
 */
function startRun(store, scope, fresh) {
  const previous = store.getMeta('sync.run')
  const sameScope = previous && JSON.stringify(previous.scope) === JSON.stringify(scope)

  if (previous && sameScope && !previous.completedAt && !fresh) return previous.id

  const id = (previous?.id || 0) + 1
  store.setMeta('sync.run', { id, scope, startedAt: new Date().toISOString(), completedAt: null })

  return id
}

/**
 * The request function recipes use, plus the bookkeeping around it: storing,
 * reading back what this run already stored, sharing in-flight requests, and
 * downloading the media a response refers to.
 */
function createFetchContext({ config, store, remote, run, progress, logger }) {
  const inflight = new Map()
  const onceDone = new Set()
  const mediaSeen = new Set()

  async function get(path, params) {
    const pairs = serializeParams(params)
    const key = canonicalKey(path, pairs)

    if (store.hasResponseFromRun(key, run)) {
      const stored = store.getResponse(key)
      return { status: stored.status, headers: stored.headers, data: stored.data }
    }

    if (inflight.has(key)) return inflight.get(key)

    const pending = fetchAndStore(key, path, pairs)
    inflight.set(key, pending)

    try {
      return await pending
    } finally {
      inflight.delete(key)
    }
  }

  async function fetchAndStore(key, path, pairs) {
    const response = await remote.request(path, pairs)

    // A server error is not an answer: keep whatever an earlier run stored,
    // and fail the OTU so a resumed run retries it.
    if (response.status >= 500) throw new Error(`HTTP ${response.status} for ${key}`)

    if (response.kind === 'binary') {
      if (config.media) saveMedia(store, key, response)
      return response
    }

    store.putResponse(key, {
      status: response.status,
      headers: response.headers,
      ...(response.kind === 'json' ? { data: response.data } : { text: response.text }),
      source: 'sync',
      run
    })

    if (config.media && response.kind === 'json') await downloadMedia(response.data)

    return response
  }

  async function downloadMedia(data) {
    for (const { key, url } of collectMedia(data, { sourceUrl: config.source.url })) {
      if (mediaSeen.has(key)) continue
      mediaSeen.add(key)

      const existing = store.getMedia(key)
      if (existing?.hash && existsSync(store.mediaPath(existing.hash))) continue

      try {
        if (saveMedia(store, key, await remote.fetchUrl(url))) progress.media += 1
      } catch (err) {
        logger.warn(`Media ${url}: ${err.message}`)
      }
    }
  }

  /** Run `fn` at most once per sync, whatever OTU asks for it. */
  async function once(id, fn) {
    if (onceDone.has(id)) return
    onceDone.add(id)
    await fn()
  }

  return { get, once }
}

/**
 * Data the site shows outside OTU pages, and the list of OTUs in scope when
 * the scope is a list rather than a tree.
 *
 * @returns {Promise<number[]>} The OTUs of the whole project, or of the
 *   geographic areas; empty when the scope is walked down from `roots`.
 */
async function syncProjectData({ ctx, config, store, remote, run, logger, signal, onPage, packageRecipes }) {
  const alreadyDone = store.getMeta('sync.project_done_run') === run
  const byArea = config.geographicAreas.length > 0
  const wholeProject = !byArea && config.roots.length === 0
  const ids = []

  if (wholeProject || byArea) {
    const params = byArea ? await areaListingParams(ctx, config, logger) : {}

    if (params) {
      await forEachPage(remote, '/otus', params, { signal, onPage }, (records) => {
        store.transaction(() => {
          for (const otu of records) {
            ids.push(otu.id)
            // The whole project is searchable from the start; narrower scopes
            // index each OTU as its page is synced.
            if (wholeProject && !alreadyDone) store.putOtu(otu, otuSearchText(otu))
          }
        })
      })
    }
  }

  if (alreadyDone) return ids

  await ctx.get('/stats')

  await forEachPage(remote, '/sources', { in_project: true }, { signal, onPage }, (records) => {
    store.transaction(() => records.forEach((source) => store.putSource(source)))
  }).catch((err) => logger.warn(`Sources: ${err.message}`))

  const newsIds = []
  await forEachPage(remote, '/news', {}, { signal, onPage }, (records) => {
    store.transaction(() =>
      records.forEach((item) => {
        store.putNews(item)
        newsIds.push(item.id)
      })
    )
  }).catch((err) => logger.warn(`News: ${err.message}`))

  for (const id of newsIds) {
    if (signal?.aborted) return ids
    await ctx.get(`/news/${id}`)
  }

  for (const entry of packageRecipes.project) {
    if (signal?.aborted) return ids
    await runPackageRecipe(entry, ctx).catch((err) => logger.warn(err.message))
  }

  // Not reached when interrupted: a resumed run fetches these again.
  if (signal?.aborted) return ids

  store.setMeta('sync.project_done_run', run)

  return ids
}

/**
 * `/otus` filter for the OTUs recorded in the configured areas, within the
 * subtrees of `roots` when there are any. Null when the roots have no taxon
 * name to filter by, so nothing is listed rather than every OTU of the areas.
 */
async function areaListingParams(ctx, config, logger) {
  const areas = config.geographicAreas
  const params = {
    geo_shape_id: areas,
    geo_shape_type: areas.map(() => 'GeographicArea'),
    geo_mode: GEO_MODES[config.geoMode]
  }

  if (!config.roots.length) return params

  const taxonNameIds = []
  for (const id of config.roots) {
    const response = await ctx.get(`/otus/${id}`, { extend: ['parents'] })
    const taxonNameId = response.status === 200 ? response.data?.taxon_name_id : null

    if (taxonNameId) taxonNameIds.push(taxonNameId)
    else logger.warn(`OTU ${id} has no taxon name: it cannot limit the geographic areas`)
  }

  if (!taxonNameIds.length) return null

  return { ...params, taxon_name_id: taxonNameIds, descendants: true }
}

/**
 * OTU ids of the breadcrumb of an OTU (`parents`, from `extend[]=parents`).
 *
 * @param {object} otu
 * @returns {number[]}
 */
export function ancestorIds(otu) {
  const ids = []

  for (const records of Object.values(otu?.parents || {})) {
    for (const record of Array.isArray(records) ? records : []) {
      if (record?.id) ids.push(record.id)
    }
  }

  return ids
}

/**
 * Walk every page of a paginated index, stopping early when aborted.
 */
async function forEachPage(remote, path, params, { signal, onPage: afterPage } = {}, onPage) {
  for (let page = 1; ; page += 1) {
    if (signal?.aborted) return

    const response = await remote.get(path, { ...params, per: LISTING_PER, page })

    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`HTTP ${response.status} listing ${path}`)
    }

    onPage(response.data)
    afterPage?.()

    const totalPages = Number(response.headers['pagination-total-pages']) || 1
    if (page >= totalPages || response.data.length === 0) return
  }
}

function otuSearchText(otu) {
  return [stripTags(otu.object_tag || ''), otu.name || ''].join(' ').trim()
}

function logPackageRecipes({ panels, everyOtu, project }, logger) {
  const lines = [
    ...[...panels].map(([id, { source }]) => `${source} (${id})`),
    ...everyOtu.map(({ source }) => `${source} (every OTU)`),
    ...project.map(({ source }) => `${source} (project)`)
  ]

  if (lines.length) logger.info(`Recipes from packages: ${lines.join(', ')}`)
}

/**
 * The layout the site shows when `taxa_page` is not configured, taken from the
 * core so the two never disagree.
 */
async function loadDefaultLayout(packageRoot) {
  const url = pathToFileURL(join(packageRoot, 'src/modules/otus/constants/layouts/overview.js')).href
  const { DEFAULT_OVERVIEW_LAYOUT } = await import(url)
  return DEFAULT_OVERVIEW_LAYOUT
}

/**
 * Resolve a panel `bind` for every configured locale, the way the page does
 * when it renders (PageLayout.vue → localizeDeep), keeping distinct results.
 *
 * Uses the core's own i18n helpers so a bind resolves exactly as it will on
 * the site.
 */
async function makeBindLocalizer(packageRoot, configuration) {
  const load = (file) => import(pathToFileURL(join(packageRoot, file)).href)
  const [{ localizeDeep }, { resolveI18nConfig }] = await Promise.all([
    load('src/i18n/localize.js'),
    load('src/i18n/config.js')
  ])

  const { locales } = resolveI18nConfig(configuration)

  return (bind) => {
    const seen = new Map()
    for (const locale of locales) {
      const localized = localizeDeep(bind, locale, configuration)
      seen.set(JSON.stringify(localized), localized)
    }
    return [...seen.values()]
  }
}
