/**
 * Request identity.
 *
 * A stored response is found again by the request that produced it, so the
 * sync must name a request exactly as the site's axios client will. Both sides
 * go through `canonicalKey`: the sync from a params object serialized the way
 * axios does, the server from the query string the browser actually sent.
 */

/** Parameters that authenticate or bust caches, never part of identity. */
const IGNORED_PARAMS = new Set(['project_token', 'token', '_'])

/**
 * Serialize a params object into [key, value] pairs the way axios 1.x does:
 * arrays as `key[]`, nested objects as `key[sub]`, null and undefined dropped,
 * dates as ISO strings. A key already ending in `[]` is not doubled.
 *
 * @param {object} params
 * @returns {Array<[string, string]>}
 */
export function serializeParams(params = {}) {
  const pairs = []

  function visit(value, key) {
    if (value === undefined || value === null) return

    if (Array.isArray(value)) {
      const base = key.endsWith('[]') ? key.slice(0, -2) : key
      for (const item of value) {
        if (item === undefined || item === null) continue
        if (typeof item === 'object' && !(item instanceof Date)) {
          visit(item, `${base}[]`)
        } else {
          pairs.push([`${base}[]`, toStringValue(item)])
        }
      }
      return
    }

    if (typeof value === 'object' && !(value instanceof Date)) {
      for (const [sub, subValue] of Object.entries(value)) {
        visit(subValue, key ? `${key}[${sub}]` : sub)
      }
      return
    }

    pairs.push([key, toStringValue(value)])
  }

  visit(params, '')

  return pairs
}

function toStringValue(value) {
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Normalize an API path: no leading or trailing slash, and no `.json`
 * extension, which TaxonWorks treats as the default format anyway.
 *
 * @param {string} path
 */
export function normalizePath(path) {
  return decodeURIComponent(path)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.json$/, '')
}

/**
 * The identity of a request: normalized path plus sorted query.
 *
 * Pairs are sorted by key only, with a stable sort, so repeated keys keep the
 * order they were sent in — `sort_order[]=Otu&sort_order[]=Observation` means
 * something different from the reverse.
 *
 * @param {string} path - API path, e.g. `/otus/1/inventory/taxonomy.json`
 * @param {Array<[string, string]>|URLSearchParams} pairs
 * @returns {string}
 */
export function canonicalKey(path, pairs = []) {
  const entries = [...pairs]
    .filter(([key]) => !IGNORED_PARAMS.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const normalized = normalizePath(path)

  return query ? `${normalized}?${query}` : normalized
}

/**
 * Canonical key of a request made from a params object.
 *
 * @param {string} path
 * @param {object} [params]
 */
export function keyFor(path, params) {
  return canonicalKey(path, serializeParams(params))
}

/**
 * Read a parameter that may arrive as `name` or `name[]`.
 *
 * @param {URLSearchParams} searchParams
 * @param {string} name
 * @returns {string[]}
 */
export function getAll(searchParams, name) {
  return [...searchParams.getAll(name), ...searchParams.getAll(`${name}[]`)]
}
