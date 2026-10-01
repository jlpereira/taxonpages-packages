import { resolve, dirname, join } from 'node:path'

/** Where the local API is mounted. The site's `url` is pointed here. */
export const API_PREFIX = '/offline/api/v1'

/** Where downloaded media files are served from. */
export const MEDIA_PREFIX = '/offline/media'

export const MODES = ['strict', 'proxy']

/** What downloaded images can be converted to. `original` keeps them as sent. */
export const IMAGE_FORMATS = ['original', 'webp', 'jpeg', 'avif']

/**
 * How a geographic area matches, mapped to TaxonWorks' `geo_mode`:
 *   exact        the area itself (geo_mode omitted)
 *   descendants  the area and the areas inside it: a country and its states
 *   spatial      anything georeferenced within the area's shape
 */
export const GEO_MODES = { exact: undefined, descendants: false, spatial: true }

/**
 * How the sync paces its requests to TaxonWorks:
 *   adaptive  a few at a time, the next as soon as one is answered: as fast as
 *             TaxonWorks answers, slower on its own when it is busy
 *   fixed     the same number every second, however long the answers take
 */
export const PACINGS = ['adaptive', 'fixed']

/** OTU pages synced at once, at least: enough to keep the requests busy. */
const MIN_PAGES = 16

/**
 * The default ceiling of adaptive pacing, per request at a time: what each
 * reaches with answers taking 400 ms. It holds the sync back only when
 * TaxonWorks answers much faster than that, whatever the requests at a time.
 */
const CEILING_PER_REQUEST = 2.5

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
  images: {
    format: 'original',
    quality: 80,
    max_size: 0,
    fields: ['original_png']
  },
  sync: {
    pacing: 'adaptive',
    parallel_requests: 8,
    requests_per_second: 8,
    parallel_downloads: 4,
    downloads_per_second: 8,
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
    // Datasets included or left out by id (see datasets.js).
    include: toFlags(raw.include),
    images: resolveImages(raw.images),
    sync: resolveSync(raw.sync),
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

/**
 * How the sync paces its requests (`offline.sync`), resolved into the options
 * of its two remote clients: one for the API, one for media downloads.
 *
 * Adaptive keeps up to `parallel_requests` requests waiting on TaxonWorks, and
 * sends the next as soon as one is answered, with `max_requests_per_second`
 * as a ceiling (0: none; by default 2.5 per request at a time). Media
 * downloads are only limited by `parallel_downloads`.
 *
 * Fixed sends `requests_per_second` requests every second, and media
 * `downloads_per_second`, `parallel_downloads` at most at once.
 *
 * @param {object} [raw] - `offline.sync`
 */
function resolveSync(raw = {}) {
  const defaults = DEFAULTS.sync
  const pacing = PACINGS.includes(raw.pacing) ? raw.pacing : defaults.pacing
  const parallelRequests = positiveInt(raw.parallel_requests, defaults.parallel_requests)
  const maxRequestsPerSecond = nonNegativeNumber(raw.max_requests_per_second, parallelRequests * CEILING_PER_REQUEST)
  const requestsPerSecond = positiveNumber(raw.requests_per_second, defaults.requests_per_second)
  const parallelDownloads = positiveInt(raw.parallel_downloads, defaults.parallel_downloads)
  const downloadsPerSecond = positiveNumber(raw.downloads_per_second, defaults.downloads_per_second)
  const adaptive = pacing === 'adaptive'

  return {
    pacing,
    parallelRequests,
    maxRequestsPerSecond,
    requestsPerSecond,
    parallelDownloads,
    downloadsPerSecond,
    retries: positiveInt(raw.retries, defaults.retries),

    // Options of the remote clients (remote.js)
    api: adaptive
      ? { maxInFlight: parallelRequests, requestsPerSecond: maxRequestsPerSecond }
      : { maxInFlight: 0, requestsPerSecond },
    media: { maxInFlight: 0, requestsPerSecond: adaptive ? 0 : downloadsPerSecond },

    // Each page waits on a few requests at a time: with fewer pages than
    // requests allowed, the pacing would never be reached.
    pages: Math.max(MIN_PAGES, adaptive ? parallelRequests * 2 : Math.ceil(requestsPerSecond * 2))
  }
}

/**
 * One line describing the pacing of a sync, for its log.
 *
 * @param {ReturnType<typeof resolveSync>} sync
 */
export function describePacing(sync) {
  const downloads = `${sync.parallelDownloads} download${sync.parallelDownloads === 1 ? '' : 's'} at a time`

  if (sync.pacing === 'fixed') {
    return `fixed, ${sync.requestsPerSecond} requests per second; ${downloads}, ${sync.downloadsPerSecond} per second`
  }

  const ceiling = sync.maxRequestsPerSecond ? `, at most ${sync.maxRequestsPerSecond} per second` : ''

  return `adaptive, ${sync.parallelRequests} requests at a time${ceiling}; ${downloads}`
}

/**
 * How downloaded images are converted before they are stored.
 *
 * @param {object} [raw] - `offline.images`
 * @returns {{ format: string, quality: number, maxSize: number, fields: string[] }}
 */
function resolveImages(raw = {}) {
  const defaults = DEFAULTS.images
  const quality = Number(raw.quality)
  const fields = Array.isArray(raw.fields) ? raw.fields.filter((f) => typeof f === 'string' && f) : defaults.fields

  return {
    format: IMAGE_FORMATS.includes(raw.format) ? raw.format : defaults.format,
    quality: Number.isInteger(quality) && quality >= 1 && quality <= 100 ? quality : defaults.quality,
    maxSize: Number.isInteger(Number(raw.max_size)) && Number(raw.max_size) > 0 ? Number(raw.max_size) : 0,
    fields: fields.length ? fields : defaults.fields
  }
}

function toFlags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean'))
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

function nonNegativeNumber(value, fallback) {
  const n = Number(value)
  return value !== null && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback
}

function stripTrailingSlash(url) {
  return typeof url === 'string' ? url.replace(/\/+$/, '') : ''
}
