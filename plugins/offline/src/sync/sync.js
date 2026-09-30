import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalKey, serializeParams } from '../params.js'
import { GEO_MODES, syncScope } from '../config.js'
import { collectMedia, saveMedia } from '../media.js'
import { stripTags } from '../text.js'
import { basePage, descendants, withCoreRecipes } from '../recipes/index.js'
import { panelsInLayout, isAvailableForRank } from './layout.js'
import { loadPackageRecipes, runPackageRecipe } from './packageRecipes.js'
import { createMediaQueue } from './mediaQueue.js'
import { createImageConverter, describeConversion } from '../images.js'
import { mediaDataset, resolveDatasets } from '../datasets.js'

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
 * With `missing`, a run fetches only what the database does not hold yet,
 * from whatever run: to add datasets (`offline.include`) without syncing
 * everything again. Nothing already stored is refreshed.
 *
 * What is stored is organized in datasets (see datasets.js): the panels of
 * the layout, and optional parts such as the map point details. Datasets left
 * out are not fetched, and everything fetched is recorded under the dataset
 * that asked for it.
 *
 * Three things run side by side: the OTU pages (several at once, and the
 * panels of each at once), the project-wide lists, and the media downloads.
 * The remote client's pacing is what limits the load on TaxonWorks, whatever
 * the number of requests waiting.
 *
 * @param {object} options
 * @param {ReturnType<import('../config.js').resolveOfflineConfig>} options.config
 * @param {import('../store.js').OfflineStore} options.store
 * @param {import('../remote.js').RemoteClient} options.remote
 * @param {import('../remote.js').RemoteClient} [options.mediaRemote] - For
 *   media downloads, paced apart from the API (default: `remote`)
 * @param {object} options.configuration - Site configuration (for locales)
 * @param {string} options.packageRoot - TaxonPages package, for its i18n helpers
 * @param {string} options.projectRoot - The site, for recipes its packages ship
 * @param {boolean} [options.fresh]
 * @param {boolean} [options.missing] - Fetch only what is not stored yet
 * @param {AbortSignal} [options.signal]
 * @param {(progress: SyncProgress) => void} [options.onProgress]
 * @param {{ info: Function, warn: Function, error: Function }} [options.logger]
 * @returns {Promise<SyncProgress>}
 */
export async function runSync({
  config,
  store,
  remote,
  mediaRemote = remote,
  configuration,
  packageRoot,
  projectRoot,
  fresh = false,
  missing: missingOnly = false,
  signal,
  onProgress = () => {},
  logger = console
}) {
  const scope = syncScope(config)
  const { id: run, missing } = startRun(store, scope, { fresh, missing: missingOnly })
  // A resumed run carries on the clock of its earlier sessions.
  const clock = { before: store.getMeta('sync.run')?.elapsedMs || 0, since: Date.now() }
  const localizeBind = await makeBindLocalizer(packageRoot, configuration)
  const layout = config.layout || (await loadDefaultLayout(packageRoot))
  const packageRecipes = await loadPackageRecipes({ projectRoot, packageRoot, configuration, logger })
  const recipes = withCoreRecipes(packageRecipes)
  const panels = panelsInLayout(layout, localizeBind, rankGroupsOf(recipes))

  logPackageRecipes(packageRecipes, logger)

  const datasets = siteDatasets({ config, panels: panels.keys(), recipes })
  const excluded = datasets.list.filter((dataset) => !dataset.included).map((dataset) => dataset.id)
  if (excluded.length) logger.info(`Leaving out: ${excluded.join(', ')}`)
  if (missing) logger.info('Fetching only what the database does not hold yet')

  // Before anything is fetched: a missing image library stops the sync here.
  const converter = config.media ? await createImageConverter(config.images) : null
  if (converter) logger.info(`Converting ${config.images.fields.join(', ')} images: ${describeConversion(config.images)}`)
  if (converter && config.images.format === 'avif' && !config.images.maxSize) {
    logger.warn(
      'AVIF at full size can take about a minute per full-size image. With images.max_size: 2048 it takes ' +
        'about 10 seconds, and WebP under a second.'
    )
  }

  const progress = {
    run,
    missing,
    phase: 'starting',
    scope,
    queued: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    requests: 0,
    media: 0,
    mediaPending: 0,
    converted: { files: 0, bytesBefore: 0, bytesAfter: 0 },
    current: null,
    elapsed: clock.before,
    startedAt: new Date().toISOString(),
    finishedAt: null
  }

  const mediaQueue = createMediaQueue({
    store,
    remote: mediaRemote,
    concurrency: config.sync.parallelDownloads,
    converter,
    signal,
    logger,
    onSaved: () => {
      progress.media += 1
      report()
    }
  })

  let lastReport = 0
  const report = (force = false) => {
    progress.requests = remote.requestCount + (mediaRemote === remote ? 0 : mediaRemote.requestCount)
    progress.mediaPending = mediaQueue.pending
    progress.converted = mediaQueue.conversion
    const now = Date.now()
    progress.elapsed = clock.before + (now - clock.since)
    if (!force && now - lastReport < PROGRESS_INTERVAL) return
    lastReport = now
    store.setMeta('sync.progress', progress)
    // Kept with the run, so the time survives a crash as well as a stop.
    store.setMeta('sync.run', { ...store.getMeta('sync.run'), elapsedMs: progress.elapsed })
    onProgress({ ...progress })
  }

  const ctxBase = createFetchContext({ config, store, remote, run, missing, datasets, mediaQueue, signal })

  if (config.media) mediaQueue.resume((field) => datasets.includes(mediaDataset(field)))

  // --- project-wide data ---
  progress.phase = 'project'
  report(true)

  // The OTU list of a list scope is needed before the pages; the rest of the
  // project-wide data is synced alongside them.
  const listedOtuIds = await listScopeOtus({
    ctx: ctxBase,
    config,
    store,
    remote,
    run,
    logger,
    signal,
    onPage: () => report()
  }).catch((err) => {
    if (signal?.aborted) return []
    throw err
  })

  const projectData = syncProjectData({
    ctx: ctxBase,
    missing,
    store,
    remote,
    run,
    logger,
    signal,
    onPage: () => report(),
    recipes
  }).catch((err) => logger.warn(`Project data: ${err.message}`))

  if (signal?.aborted) {
    await projectData
    return finish()
  }

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
      // The children are requested with the page itself: nothing about them
      // depends on it, and the sooner they are queued the sooner other
      // workers have something to do.
      const [{ otu, taxon }] = await Promise.all([basePage(ctx), descendants(ctx)])

      if (!otu) throw new Error('OTU not found')

      // Before the panels: a failing panel must not cut off the subtree.
      await expand(ctx, otu)

      const { parents, ...record } = otu
      store.putOtu(record, otuSearchText(record))

      ctx.otu = otu
      ctx.taxon = taxon
      ctx.taxonId = taxon?.id ?? otu.taxon_name_id ?? null
      ctx.rankString = taxon?.rank_string

      const runs = []

      if (taxon) {
        for (const [panelId, entries] of panels) {
          if (!datasets.includes(panelId)) continue

          const entry = recipes.panels.get(panelId)
          if (!entry) continue

          // A package's recipe names its package in the errors it throws.
          const recipe = entry.source === 'core' ? entry.recipe : (...args) => runPackageRecipe(entry, ...args)

          const binds = entries
            .filter((entry) => isAvailableForRank(entry.rankGroups, ctx.rankString))
            .map((entry) => entry.bind)

          if (binds.length) runs.push(() => recipe({ ...ctx, ...ctx.forDataset(panelId) }, binds))
        }
      }

      for (const entry of recipes.everyOtu) {
        runs.push(() => runPackageRecipe(entry, { ...ctx, ...ctx.forDataset(entry.source) }, []))
      }

      // Every panel at once, as the page loads them. All of them are let
      // finish before the OTU is failed, so nothing is left writing after it.
      const failure = (await Promise.allSettled(runs.map((run) => run()))).find(
        (result) => result.status === 'rejected'
      )
      if (failure) throw failure.reason

      store.markOtu(otuId, run)
      progress.done += 1
    } catch (err) {
      // Stopped, not failed: the OTU is synced again when the run resumes.
      if (signal?.aborted) return

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

  await Promise.all(Array.from({ length: config.sync.pages }, worker))

  // The pages are done; say what is left to wait for.
  progress.current = null

  if (!signal?.aborted) {
    progress.phase = mediaQueue.pending ? 'media' : 'project'
    report(true)
  }

  await projectData

  if (!signal?.aborted && mediaQueue.pending) {
    progress.phase = 'media'
    report(true)
  }

  return finish()

  async function finish() {
    // Let downloads in flight end before the store is closed.
    await mediaQueue.drain()

    progress.current = null
    progress.phase = signal?.aborted ? 'interrupted' : 'completed'
    progress.finishedAt = new Date().toISOString()

    report(true)

    if (!signal?.aborted) {
      store.setMeta('sync.run', { ...store.getMeta('sync.run'), completedAt: progress.finishedAt })
    }

    return progress
  }
}

/**
 * @typedef {object} SyncProgress
 * @property {number} run
 * @property {boolean} missing - Whether the run fetches only what is missing
 * @property {string} phase - starting | project | otus | media | completed | interrupted
 * @property {ReturnType<typeof syncScope>} scope
 * @property {number} queued
 * @property {number} done
 * @property {number} skipped
 * @property {number} failed
 * @property {number} requests - API requests and media downloads
 * @property {number} media - Files downloaded
 * @property {number} mediaPending - Files queued or downloading
 * @property {{ files: number, bytesBefore: number, bytesAfter: number }} converted -
 *   Images converted in this session (`offline.images`)
 * @property {number} elapsed - Milliseconds the run has taken so far, across
 *   the sessions of a resumed run
 * @property {number|null} current
 * @property {string} startedAt
 * @property {string|null} finishedAt
 */

/**
 * Continue the current run, or start a new one. A resumed run keeps fetching
 * only what is missing if it started that way.
 *
 * @returns {{ id: number, missing: boolean }}
 */
function startRun(store, scope, { fresh, missing }) {
  const previous = store.getMeta('sync.run')
  const sameScope = previous && JSON.stringify(previous.scope) === JSON.stringify(scope)

  if (previous && sameScope && !previous.completedAt && !fresh) {
    return { id: previous.id, missing: Boolean(previous.missing || missing) }
  }

  const id = (previous?.id || 0) + 1
  store.setMeta('sync.run', { id, scope, missing, startedAt: new Date().toISOString(), completedAt: null })

  return { id, missing }
}

/**
 * The datasets of the site: the panels of the layout that fetch something,
 * the core's, and those packages declare.
 *
 * @param {object} options
 * @param {ReturnType<import('../config.js').resolveOfflineConfig>} options.config
 * @param {Iterable<string>} options.panels - Panel ids of the layout
 * @param {import('./packageRecipes.js').PackageRecipes} options.recipes - Core
 *   and package recipes
 */
function siteDatasets({ config, panels, recipes }) {
  return resolveDatasets({
    panels: [...panels].filter((id) => recipes.panels.has(id)),
    recipeDatasets: recipes.datasets,
    include: config.include,
    media: config.media
  })
}

/**
 * The datasets of a site, for the wizard and the prune command: what a sync
 * of it would store, and which are included.
 *
 * @param {object} options
 * @param {ReturnType<import('../config.js').resolveOfflineConfig>} options.config
 * @param {object} options.configuration
 * @param {string} options.packageRoot
 * @param {string} options.projectRoot
 * @param {{ warn: Function }} [options.logger]
 * @returns {Promise<import('../datasets.js').Datasets>}
 */
export async function loadSiteDatasets({ config, configuration, packageRoot, projectRoot, logger = console }) {
  const layout = config.layout || (await loadDefaultLayout(packageRoot))
  const recipes = withCoreRecipes(await loadPackageRecipes({ projectRoot, packageRoot, configuration, logger }))
  const panels = panelsInLayout(layout, (bind) => [bind])

  return siteDatasets({ config, panels: panels.keys(), recipes })
}

/** The rank groups each panel is limited to by default, by panel id. */
function rankGroupsOf(recipes) {
  return Object.fromEntries([...recipes.panels].map(([id, { rankGroup }]) => [id, rankGroup]))
}

/**
 * The request function recipes use, plus the bookkeeping around it: storing,
 * reading back what this run already stored (or anything stored, when
 * fetching only what is missing), sharing in-flight requests, queuing the
 * media a response refers to, and recording each under its dataset.
 *
 * Returns the context of the `page` dataset; `forDataset` gives the same
 * functions recording under another.
 */
function createFetchContext({ config, store, remote, run, missing, datasets, mediaQueue, signal }) {
  const inflight = new Map()
  const onceDone = new Set()
  const apiPrefix = `${config.source.url}/`

  /**
   * GET a path — or an absolute URL into the source API, as a response
   * links to it (DwC `associatedMedia`) — the way the site requests it.
   */
  async function get(path, params, dataset) {
    let pairs = serializeParams(params)

    if (/^https?:\/\//.test(path)) {
      if (!isApiUrl(path)) throw new Error(`${path} is not a URL of the TaxonWorks API`)
      const url = new URL(path)
      pairs = [...url.searchParams, ...pairs]
      path = url.href.slice(apiPrefix.length).split('?')[0]
    }

    const key = canonicalKey(path, pairs)
    const response = await getByKey(key, path, pairs)

    if (response.kind !== 'binary') store.tagItem(dataset, 'response', key)

    return response
  }

  async function getByKey(key, path, pairs) {
    const storedRun = store.responseRun(key)
    const fromThisRun = storedRun === run

    if (fromThisRun || (missing && storedRun !== undefined)) {
      const stored = store.getResponse(key)
      // Stored by an earlier run: its media may be of a dataset added since.
      if (!fromThisRun && stored.kind === 'json') queueMedia(stored.data)
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

  function isApiUrl(url) {
    return typeof url === 'string' && url.startsWith(apiPrefix)
  }

  function queueMedia(data) {
    if (!config.media) return

    for (const { key, url, field } of collectMedia(data, { sourceUrl: config.source.url })) {
      const dataset = mediaDataset(field)
      if (!datasets.includes(dataset)) continue

      store.tagItem(dataset, 'media', key)
      mediaQueue.add(key, url, field)
    }
  }

  async function fetchAndStore(key, path, pairs) {
    const response = await remote.request(path, pairs, { signal })

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

    if (response.kind === 'json') queueMedia(response.data)

    return response
  }

  /** Run `fn` at most once per sync, whatever OTU asks for it. */
  async function once(id, fn) {
    if (onceDone.has(id)) return
    onceDone.add(id)
    await fn()
  }

  function forDataset(dataset) {
    return {
      dataset,
      get: (path, params) => get(path, params, dataset),
      once,
      includes: (id) => datasets.includes(id),
      isApiUrl,
      forDataset
    }
  }

  return forDataset('page')
}

/**
 * The OTUs in scope when the scope is a list rather than a tree.
 *
 * @returns {Promise<number[]>} The OTUs of the whole project, or of the
 *   geographic areas; empty when the scope is walked down from `roots`.
 */
async function listScopeOtus({ ctx, config, store, remote, run, logger, signal, onPage }) {
  const byArea = config.geographicAreas.length > 0
  const wholeProject = !byArea && config.roots.length === 0
  const ids = []

  if (!wholeProject && !byArea) return ids

  const params = byArea ? await areaListingParams(ctx, config, logger) : {}
  if (!params) return ids

  // The whole project is searchable from the start; narrower scopes index
  // each OTU as its page is synced.
  const index = wholeProject && store.getMeta('sync.project_done_run') !== run

  await forEachPage(remote, '/otus', params, { signal, onPage }, (records) => {
    store.transaction(() => {
      for (const otu of records) {
        ids.push(otu.id)
        if (index) store.putOtu(otu, otuSearchText(otu))
      }
    })
  })

  return ids
}

/**
 * Data the site shows outside OTU pages: what the project recipes of the core
 * (statistics, bibliography, news) and of packages fetch. Runs alongside the
 * OTU pages, so a failure is logged rather than thrown; the project data is
 * then fetched again when the run resumes.
 */
async function syncProjectData({ ctx, recipes, missing, store, remote, run, logger, signal, onPage }) {
  if (store.getMeta('sync.project_done_run') === run) return

  const core = {
    store,
    missing,
    list: (path, params, onRecords) => forEachPage(remote, path, params, { signal, onPage }, onRecords)
  }

  const results = await Promise.allSettled(
    recipes.project.map((entry) => {
      const recipeCtx = { ...ctx, ...ctx.forDataset(entry.dataset ?? entry.source) }
      return entry.core ? entry.recipe(recipeCtx, core) : runPackageRecipe(entry, recipeCtx)
    })
  )

  const failures = results.filter((result) => result.status === 'rejected')
  if (!signal?.aborted) {
    for (const { reason } of failures) logger.warn(`Project data: ${reason?.message ?? reason}`)
  }

  // Not reached when interrupted: a resumed run fetches these again.
  if (signal?.aborted || failures.length) return

  store.setMeta('sync.project_done_run', run)
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
 * Walk every page of a paginated index, stopping early when aborted. Pages
 * after the first are requested at once, since the first tells how many there
 * are; the remote client's pacing spaces them. `onPage` sees them in the
 * order they arrive.
 */
async function forEachPage(remote, path, params, { signal, onPage: afterPage } = {}, onPage) {
  async function fetchPage(page) {
    let response
    try {
      response = await remote.get(path, { ...params, per: LISTING_PER, page }, { signal })
    } catch (err) {
      if (signal?.aborted) return null
      throw err
    }

    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`HTTP ${response.status} listing ${path}`)
    }

    onPage(response.data)
    afterPage?.()

    return response
  }

  if (signal?.aborted) return

  const first = await fetchPage(1)
  if (!first || first.data.length === 0) return

  const totalPages = Number(first.headers['pagination-total-pages']) || 1
  const rest = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)

  await Promise.all(rest.map(fetchPage))
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
