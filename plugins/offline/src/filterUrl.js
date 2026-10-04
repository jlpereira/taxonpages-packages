/**
 * TaxonWorks filter URLs.
 *
 * The filter tasks of TaxonWorks keep their parameters in the address bar, as
 * `qs` writes them (`key[]` for arrays, `a[b]` for nested objects), e.g.
 *
 *   https://tw.example.org/tasks/otus/filter?taxon_name_id[]=1&descendants=true
 *
 * Pasted into the setup wizard, such a URL becomes the `/otus` filter the sync
 * lists its OTUs with (`offline.otu_filter`). A URL of another filter, such as
 * collection objects, is nested under its subquery (`collection_object_query`):
 * the OTUs of what that filter finds.
 *
 * No Node imports: the setup editor uses this module too.
 */

import { serializeParams } from './params.js'

/**
 * Parameters that are not part of a filter: paging, authentication and the
 * shape of the response. Dropped at every level, subqueries included.
 */
export const CONTROL_PARAMS = new Set([
  'per',
  'page',
  'paginate',
  'project_token',
  'token',
  'user_token',
  'extend',
  'embed',
  'venn',
  'venn_mode',
  'venn_ignore_pagination',
  'format',
  '_'
])

/**
 * Filters the OTU filter can nest, by the path segment of their task (or API
 * index), mapped to their subquery. From `SUBQUERIES[:otu]` in TaxonWorks'
 * lib/queries/query/filter.rb.
 */
const SUBQUERIES = {
  anatomical_parts: 'anatomical_part_query',
  asserted_distributions: 'asserted_distribution_query',
  asserted_environments: 'asserted_environment_query',
  biological_associations: 'biological_association_query',
  collecting_events: 'collecting_event_query',
  collection_objects: 'collection_object_query',
  content: 'content_query',
  contents: 'content_query',
  descriptors: 'descriptor_query',
  dwc_occurrences: 'dwc_occurrence_query',
  extracts: 'extract_query',
  field_occurrences: 'field_occurrence_query',
  images: 'image_query',
  loans: 'loan_query',
  observations: 'observation_query',
  sounds: 'sound_query',
  sources: 'source_query',
  taxon_names: 'taxon_name_query'
}

/**
 * Parameters the plugin sets from its own settings, which a filter must not
 * set as well: they would be overwritten.
 */
const AREA_PARAMS = ['geo_shape_id', 'geo_shape_type', 'geo_mode']
const ROOT_PARAMS = ['taxon_name_id', 'descendants']

/**
 * Parse a filter URL pasted from TaxonWorks: the URL of a filter task, of its
 * API request, or a bare query string.
 *
 * @param {string} input
 * @returns {{ params: object, source: string, subquery: string|null, ignored: string[] }}
 *   `source` is the filter the URL comes from (`otus`, `collection_objects`…),
 *   `ignored` the parameters dropped.
 * @throws {Error} When the URL is of a filter OTUs cannot be filtered by, or
 *   has no filter parameters
 */
export function parseFilterUrl(input) {
  const text = String(input || '').trim()
  if (!text) throw new Error('Paste the URL of a TaxonWorks filter')

  const { path, query } = splitUrl(text)
  const source = filterSource(path)

  if (source !== 'otus' && !SUBQUERIES[source]) {
    throw new Error(`OTUs can't be filtered by a ${source.replace(/_/g, ' ')} filter`)
  }

  const { params, ignored } = stripControlParams(parseQuery(new URLSearchParams(query)))

  if (!Object.keys(params).length) {
    throw new Error('The URL has no filter parameters. Run the filter in TaxonWorks first, then copy its URL.')
  }

  const subquery = source === 'otus' ? null : SUBQUERIES[source]

  return { params: subquery ? { [subquery]: params } : params, source, subquery, ignored }
}

/**
 * Parse query pairs into a params object, the inverse of `serializeParams`:
 * `key[]` makes an array, `a[b]` a nested object. Values that serialize back
 * to the same text become numbers and booleans, so they read well in YAML.
 *
 * @param {Iterable<[string, string]>} pairs
 * @returns {object}
 * @throws {Error} On keys that nest inside arrays (`a[][b]`)
 */
export function parseQuery(pairs) {
  const result = {}

  for (const [key, raw] of pairs) {
    const path = keyPath(key)
    if (!path) throw new Error(`Unsupported parameter: ${key}`)

    const isArray = path[path.length - 1] === ''
    if (isArray) path.pop()

    let target = result
    for (const segment of path.slice(0, -1)) {
      if (!isPlainObject(target[segment])) target[segment] = {}
      target = target[segment]
    }

    const last = path[path.length - 1]
    const value = toValue(raw)

    if (isArray) {
      if (!Array.isArray(target[last])) target[last] = []
      target[last].push(value)
    } else {
      target[last] = value
    }
  }

  return result
}

/**
 * Drop paging, authentication and response-shape parameters, at every level,
 * and empty values.
 *
 * @param {object} params
 * @returns {{ params: object, ignored: string[] }} `ignored` names each
 *   control parameter dropped, as its key in the URL (`collection_object_query[per]`)
 */
export function stripControlParams(params) {
  const ignored = []

  function visit(value, prefix) {
    const out = {}

    for (const [key, item] of Object.entries(value)) {
      const name = prefix ? `${prefix}[${key}]` : key

      if (CONTROL_PARAMS.has(key)) {
        ignored.push(name)
        continue
      }

      if (isPlainObject(item)) {
        const nested = visit(item, name)
        if (Object.keys(nested).length) out[key] = nested
      } else if (Array.isArray(item)) {
        const list = item.filter((v) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
        if (list.length) out[key] = list
      } else if (item !== null && item !== undefined && item !== '') {
        out[key] = item
      }
    }

    return out
  }

  return { params: isPlainObject(params) ? visit(params, '') : {}, ignored }
}

/**
 * The parameters of a filter that the plugin sets itself from its other
 * settings: geographic areas, and the roots (as their taxon names).
 *
 * @param {object} filter
 * @param {{ areas?: boolean, roots?: boolean }} scope
 * @returns {string[]}
 */
export function conflictingParams(filter = {}, { areas = false, roots = false } = {}) {
  const reserved = [...(areas ? AREA_PARAMS : []), ...(roots ? ROOT_PARAMS : [])]

  return reserved.filter((key) => Object.hasOwn(filter, key))
}

/**
 * A filter as one stable line: its query, with keys sorted (repeated keys keep
 * their order). For the scope of a run, and logs.
 *
 * @param {object} filter
 * @returns {string}
 */
export function filterToQuery(filter = {}) {
  return serializeParams(filter)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

/** The path and the query of a URL, a path, or a bare query string. */
function splitUrl(text) {
  const withoutHost = (path) => path.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const mark = text.indexOf('?')

  if (mark === -1) {
    // A bare query (`a=1&b=2`), or a URL without one.
    return text.includes('=') ? { path: '', query: text } : { path: withoutHost(text), query: '' }
  }

  return { path: withoutHost(text.slice(0, mark)), query: text.slice(mark + 1).replace(/#.*$/, '') }
}

/**
 * The filter a URL path belongs to: `tasks/<name>/filter`, or an API index
 * (`/api/v1/<name>`, `/<name>/filter.json`). A bare query is an OTU filter.
 */
function filterSource(path) {
  const clean = path.replace(/[#?].*$/, '').replace(/\.json$/, '').replace(/^\/+|\/+$/g, '')
  if (!clean) return 'otus'

  const task = clean.match(/(?:^|\/)tasks\/([a-z_]+)\/filter$/)
  if (task) return task[1]

  const api = clean.match(/(?:^|\/)([a-z_]+)(?:\/filter)?$/)
  if (api) return api[1]

  throw new Error('Not a TaxonWorks filter URL')
}

/** `a[b][]` → ['a', 'b', '']; null when the key is malformed or nests in an array. */
function keyPath(key) {
  const match = key.match(/^([^[\]]+)((?:\[[^[\]]*\])*)$/)
  if (!match) return null

  const path = [match[1], ...[...match[2].matchAll(/\[([^[\]]*)\]/g)].map((m) => m[1])]

  // Only the last segment may be empty (an array).
  if (path.slice(0, -1).some((segment) => segment === '')) return null

  return path
}

function toValue(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^(0|[1-9]\d{0,14})$/.test(raw)) return Number(raw)
  return raw
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
