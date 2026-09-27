/**
 * Deduplication of stored responses.
 *
 * TaxonWorks responses repeat large pieces verbatim across endpoints and OTUs:
 * the same country polygon under thousands of species, the same aggregate map
 * in `distribution.json` (as a string), `distribution.geojson` (as an object)
 * and `cached_maps/:id`, the same parent OTU records under every sibling. Those
 * pieces are moved into content-addressed blobs and replaced by a marker, so
 * each is stored once however many responses carry it.
 *
 * Markers are single-key objects:
 *   { "$ref": hash }   a JSON value stored as a blob
 *   { "$str": hash }   a long string stored as a blob
 *   { "$json": value } a string that held JSON, kept parsed so its own
 *                      pieces deduplicate (only when re-serializing it gives
 *                      back the exact same string)
 *   { "$esc": object } a real object that happens to look like a marker
 *
 * What gets extracted is decided by shape, not by endpoint, so a response the
 * rules were not written for still benefits:
 *   - `coordinates` arrays of GeoJSON geometries
 *   - long strings
 *   - TaxonWorks records (objects with a `global_id`)
 */

import { createHash } from 'node:crypto'

export const THRESHOLDS = {
  coordinates: 1024,
  string: 4096,
  record: 256
}

const MARKERS = new Set(['$ref', '$str', '$json', '$esc'])

/**
 * Content hash of a blob. 128 bits is far beyond collision range for any
 * database this will build, and halves the size of every marker.
 *
 * @param {string} text
 */
export function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/**
 * Replace shared pieces of a JSON value with markers.
 *
 * @param {unknown} value - Parsed response body
 * @param {(text: string) => string} putBlob - Stores a blob, returns its hash
 * @returns {unknown}
 */
export function deflate(value, putBlob) {
  function walk(node, key) {
    if (typeof node === 'string') return walkString(node)
    if (Array.isArray(node)) return walkArray(node, key)
    if (node && typeof node === 'object') return walkObject(node)
    return node
  }

  function walkString(text) {
    if (text.length < THRESHOLDS.string) return text

    if (text[0] === '{' || text[0] === '[') {
      try {
        const parsed = JSON.parse(text)
        if (JSON.stringify(parsed) === text) return { $json: walk(parsed) }
      } catch {
        // Not JSON after all: stored as a plain string below
      }
    }

    return { $str: putBlob(text) }
  }

  function walkArray(list, key) {
    const out = list.map((item) => walk(item))

    if (key === 'coordinates') {
      const text = JSON.stringify(out)
      if (text.length >= THRESHOLDS.coordinates) return { $ref: putBlob(text) }
    }

    return out
  }

  function walkObject(object) {
    const keys = Object.keys(object)
    let out = {}

    for (const k of keys) out[k] = walk(object[k], k)

    if (keys.length === 1 && MARKERS.has(keys[0])) out = { $esc: out }

    if (typeof object.global_id === 'string') {
      const text = JSON.stringify(out)
      if (text.length >= THRESHOLDS.record) return { $ref: putBlob(text) }
    }

    return out
  }

  return walk(value)
}

/**
 * Restore a value deflated by `deflate`.
 *
 * @param {unknown} value
 * @param {(hash: string) => string} getBlob - Returns a blob's text
 * @returns {unknown}
 */
export function inflate(value, getBlob) {
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node

    const keys = Object.keys(node)

    if (keys.length === 1) {
      switch (keys[0]) {
        case '$ref':
          return walk(JSON.parse(getBlob(node.$ref)))
        case '$str':
          return getBlob(node.$str)
        case '$json':
          return JSON.stringify(walk(node.$json))
        case '$esc':
          return walkEntries(node.$esc)
      }
    }

    return walkEntries(node)
  }

  function walkEntries(object) {
    const out = {}
    for (const [k, v] of Object.entries(object)) out[k] = walk(v)
    return out
  }

  return walk(value)
}
