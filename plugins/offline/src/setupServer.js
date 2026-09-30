import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GEO_MODES, resolveOfflineConfig } from './config.js'
import { OfflineStore } from './store.js'
import { RemoteClient } from './remote.js'
import { readMisses } from './misses.js'
import { stripTags } from './text.js'

const MAX_MISSES = 200

/** Package loading warnings belong to the sync log, not to wizard requests. */
const quiet = { info() {}, warn() {}, error() {} }

/**
 * Routes for the setup wizard, mounted at /api/plugins/offline.
 *
 *   GET  /status          configuration, database contents, sync state
 *   GET  /datasets        what a sync stores, which is included, and its size
 *   POST /prune           delete what datasets left out hold
 *   POST /sync            start `taxonpages offline:sync` in the background
 *                         ({ fresh } starts over, { missing } adds only what
 *                         is not stored)
 *   POST /sync/stop       stop it (resumable)
 *   GET  /sync/events     progress as server-sent events
 *   GET  /misses          summarized miss log
 *   POST /misses/clear    empty the miss log
 *   GET  /otus/search     find an OTU on the remote API, to pick a root
 *   GET  /scope/preview   how many OTUs the areas (and roots) match
 *
 * The sync runs as a child process of the CLI rather than inside the wizard,
 * so it behaves exactly as from a terminal and keeps running on its own terms.
 * The configuration is re-read on every request: the wizard edits it while
 * this server is up.
 */
export function registerSetupRoutes(router, { projectRoot, packageRoot }) {
  const state = {
    child: null,
    progress: null,
    lastResult: null,
    error: null,
    log: [],
    listeners: new Set()
  }

  const readConfig = async () => {
    const { loadConfiguration } = await import(
      pathToFileURL(join(packageRoot, 'src/utils/loadConfiguration.js')).href
    )
    const configuration = loadConfiguration(projectRoot)
    return { configuration, config: resolveOfflineConfig(configuration, projectRoot) }
  }

  const broadcast = (event) => {
    for (const send of state.listeners) send(event)
  }

  router.get('/status', async (_req, res) => {
    const { config } = await readConfig()
    const store = safeOpen(config)

    res.json({
      config: {
        enabled: config.enabled,
        mode: config.mode,
        database: config.database,
        roots: config.roots,
        geographicAreas: config.geographicAreas,
        geoMode: config.geoMode,
        includeAncestors: config.includeAncestors,
        source: config.source.url,
        hasToken: Boolean(config.source.token)
      },
      database: store
        ? { stats: store.stats(), run: store.getMeta('sync.run') || null, progress: store.getMeta('sync.progress') || null }
        : null,
      sync: {
        running: Boolean(state.child),
        progress: state.progress,
        lastResult: state.lastResult,
        error: state.error,
        log: state.log.slice(-50)
      }
    })

    store?.close()
  })

  router.post('/sync', async (req, res) => {
    if (state.child) return res.status(409).json({ error: 'A sync is already running' })

    const { config } = await readConfig()
    if (!config.source.url) {
      return res.status(400).json({ error: 'Set the API URL in API Connection first' })
    }

    const args = [join(packageRoot, 'bin/taxonpages.js'), 'offline:sync', '--json']
    if (req.body?.fresh) args.push('--fresh')
    if (req.body?.missing) args.push('--missing')

    const child = spawn(process.execPath, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })

    state.child = child
    state.progress = null
    state.lastResult = null
    state.error = null
    state.log = []

    readLines(child.stdout, (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return addLog(state, line)
      }

      if (message.type === 'progress') {
        state.progress = message
        broadcast({ type: 'progress', progress: message })
      } else if (message.type === 'done') {
        state.lastResult = message
      } else if (message.type === 'error') {
        state.error = message.message
      }
    })

    readLines(child.stderr, (line) => {
      addLog(state, line)
      broadcast({ type: 'log', line })
    })

    child.on('close', (code) => {
      state.child = null
      if (code && !state.error && !state.lastResult) state.error = `Sync exited with code ${code}`
      broadcast({ type: 'finished', result: state.lastResult, error: state.error })
    })

    res.status(202).json({ started: true })
  })

  router.get('/datasets', async (_req, res) => {
    try {
      const { configuration, config } = await readConfig()
      const { loadSiteDatasets } = await import('./sync/sync.js')
      const datasets = await loadSiteDatasets({ config, configuration, packageRoot, projectRoot, logger: quiet })
      const store = safeOpen(config)
      const sizes = store ? store.datasetSizes() : {}
      store?.close()

      res.json({ datasets: datasets.list.map((dataset) => ({ ...dataset, size: sizes[dataset.id] || null })) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/prune', async (_req, res) => {
    if (state.child) return res.status(409).json({ error: 'Wait for the sync to finish' })

    try {
      const { configuration, config } = await readConfig()
      const store = safeOpen(config)
      if (!store) return res.status(404).json({ error: 'No database yet' })

      try {
        const { loadSiteDatasets } = await import('./sync/sync.js')
        const { pruneDatasets } = await import('./prune.js')
        const datasets = await loadSiteDatasets({ config, configuration, packageRoot, projectRoot, logger: quiet })
        res.json(pruneDatasets({ store, datasets }))
      } finally {
        store.close()
      }
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/sync/stop', (_req, res) => {
    if (!state.child) return res.status(409).json({ error: 'No sync is running' })

    state.child.kill('SIGINT')
    res.json({ stopping: true })
  })

  router.get('/sync/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.flushHeaders()

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    send({ type: 'hello', running: Boolean(state.child), progress: state.progress })

    state.listeners.add(send)
    req.on('close', () => state.listeners.delete(send))
  })

  router.get('/misses', async (_req, res) => {
    const { config } = await readConfig()
    const misses = readMisses(config.missesFile)

    res.json({ total: misses.length, misses: misses.slice(0, MAX_MISSES), file: config.missesFile })
  })

  router.post('/misses/clear', async (_req, res) => {
    const { config } = await readConfig()
    rmSync(config.missesFile, { force: true })
    res.json({ cleared: true })
  })

  registerScopePreview(router, readConfig)

  router.get('/otus/search', async (req, res) => {
    const term = String(req.query.term || '').trim()
    if (!term) return res.json([])

    const { config } = await readConfig()
    if (!config.source.url) return res.status(400).json({ error: 'No API URL configured' })

    try {
      const remote = new RemoteClient({ url: config.source.url, token: config.source.token, retries: 0, timeout: 15000 })

      // A numeric term is an OTU id: look it up directly.
      if (/^\d+$/.test(term)) {
        const response = await remote.get(`/otus/${term}`)
        return res.json(response.status === 200 ? [toChoice(response.data)] : [])
      }

      const response = await remote.get('/otus/autocomplete', { term, having_taxon_name_only: true })
      const list = Array.isArray(response.data) ? response.data : []

      // The autocomplete lists an OTU once per kind of match; keep the first.
      const choices = new Map()
      for (const item of list) {
        if (!choices.has(item.id)) choices.set(item.id, { id: item.id, label: stripTags(item.label_html || item.label || '') })
      }

      res.json([...choices.values()].slice(0, 20))
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })
}

/**
 * Preview of an area scope, from the settings being edited (not yet saved):
 *   ?areas=1,2&roots=3&geo_mode=descendants
 * There is no area search in the API, so this is how an area id is checked:
 * by what it matches.
 */
function registerScopePreview(router, readConfig) {
  router.get('/scope/preview', async (req, res) => {
    const list = (value) =>
      String(value || '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)

    const areas = list(req.query.areas)
    const roots = list(req.query.roots)
    const geoMode = Object.hasOwn(GEO_MODES, req.query.geo_mode) ? req.query.geo_mode : 'descendants'

    if (!areas.length) return res.json({ total: null, sample: [] })

    const { config } = await readConfig()
    if (!config.source.url) return res.status(400).json({ error: 'No API URL configured' })

    try {
      const remote = new RemoteClient({ url: config.source.url, token: config.source.token, retries: 0, timeout: 30000 })
      const params = {
        geo_shape_id: areas,
        geo_shape_type: areas.map(() => 'GeographicArea'),
        geo_mode: GEO_MODES[geoMode],
        per: 5,
        page: 1
      }

      if (roots.length) {
        const taxonNameIds = []
        for (const id of roots) {
          const response = await remote.get(`/otus/${id}`)
          if (response.status === 200 && response.data?.taxon_name_id) taxonNameIds.push(response.data.taxon_name_id)
        }
        if (!taxonNameIds.length) return res.json({ total: 0, sample: [] })
        Object.assign(params, { taxon_name_id: taxonNameIds, descendants: true })
      }

      const response = await remote.get('/otus', params)
      if (response.status !== 200 || !Array.isArray(response.data)) {
        return res.status(502).json({ error: `TaxonWorks answered ${response.status}` })
      }

      res.json({
        total: Number(response.headers['pagination-total']) || response.data.length,
        sample: response.data.map(toChoice)
      })
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })
}

function toChoice(otu) {
  return { id: otu.id, label: stripTags(otu.object_tag || otu.name || String(otu.id)) }
}

function safeOpen(config) {
  try {
    return OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })
  } catch {
    return null
  }
}

function addLog(state, line) {
  if (!line.trim()) return
  state.log.push(line)
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500)
}

function readLines(stream, onLine) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      onLine(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
    }
  })
  stream.on('end', () => buffer && onLine(buffer))
}

