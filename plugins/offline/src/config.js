import { resolve, dirname, join } from 'node:path'

/** Where the local API is mounted. The site's `url` is pointed here. */
export const API_PREFIX = '/offline/api/v1'

/** Where downloaded media files are served from. */
export const MEDIA_PREFIX = '/offline/media'

export const MODES = ['strict', 'proxy']

/**
 * How a geographic area matches, mapped to TaxonWorks' `geo_mode`:
 *   exact        the area itself (geo_mode omitted)
 *   descendants  the area and the areas inside it: a country and its states
 *   spatial      anything georeferenced within the area's shape
 */
export const GEO_MODES = { exact: undefined, descendants: false, spatial: true }

const DEFAULTS = {
  enabled: false,
  mode: 'strict',
  proxy_store: true,
  log_misses: false,
  database: '.taxonpages/offline/offline.db',
  roots: [],
  geographic_areas: [],
  geo_mode: 'descendants',
  include_ancestors: false,
  media: true,
  sync: {
    concurrency: 4,
    requests_per_second: 8,
    retries: 3
  }
}

/**
 * Normalize the `offline` section of the site configuration (config/offline.yml)
 * and join it with the remote API the data comes from (config/api.yml).
 *
 * @param {object} configuration - Merged site configuration
 * @param {string} projectRoot
 */
export function resolveOfflineConfig(configuration = {}, projectRoot = process.cwd()) {
  const raw = configuration.offline || {}
  const sync = { ...DEFAULTS.sync, ...(raw.sync || {}) }
  const database = resolve(projectRoot, raw.database || DEFAULTS.database)
  const dataDir = dirname(database)

  return {
    enabled: raw.enabled === true,
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
    proxyStore: raw.proxy_store !== false,
    logMisses: raw.log_misses === true,
    database,
    mediaDir: join(dataDir, 'media'),
    missesFile: join(dataDir, 'misses.jsonl'),
    roots: toIdList(raw.roots),
    geographicAreas: toIdList(raw.geographic_areas),
    geoMode: Object.hasOwn(GEO_MODES, raw.geo_mode) ? raw.geo_mode : DEFAULTS.geo_mode,
    includeAncestors: raw.include_ancestors === true,
    media: raw.media !== false,
    sync: {
      concurrency: positiveInt(sync.concurrency, DEFAULTS.sync.concurrency),
      requestsPerSecond: positiveNumber(
        sync.requests_per_second,
        DEFAULTS.sync.requests_per_second
      ),
      retries: positiveInt(sync.retries, DEFAULTS.sync.retries)
    },
    source: {
      url: stripTrailingSlash(configuration.url),
      token: configuration.project_token || ''
    },
    // Null when the site uses the core's default layout; the sync loads it.
    layout: configuration.taxa_page || null
  }
}

/**
 * What a sync covers, in the form stored with each run: a run resumes only
 * when its scope is unchanged.
 *
 * @param {ReturnType<typeof resolveOfflineConfig>} config
 */
export function syncScope(config) {
  return {
    roots: config.roots,
    geographicAreas: config.geographicAreas,
    geoMode: config.geographicAreas.length ? config.geoMode : null,
    includeAncestors: config.includeAncestors
  }
}

/**
 * One line describing a scope, for logs and the status command.
 *
 * @param {ReturnType<typeof syncScope>} scope
 */
export function describeScope({ roots = [], geographicAreas = [], geoMode, includeAncestors } = {}) {
  const parts = []

  if (roots.length) parts.push(`subtrees of OTU ${roots.join(', ')}`)
  if (geographicAreas.length) {
    parts.push(`${roots.length ? 'recorded in' : 'OTUs recorded in'} geographic area ${geographicAreas.join(', ')} (${geoMode})`)
  }

  const text = parts.length ? parts.join(', ') : 'the whole project'

  return includeAncestors ? `${text}, with their ancestors` : text
}

function toIdList(value) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value]

  return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

function positiveNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function stripTrailingSlash(url) {
  return typeof url === 'string' ? url.replace(/\/+$/, '') : ''
}
