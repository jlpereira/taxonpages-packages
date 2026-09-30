import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizePath } from './params.js'

/**
 * Fields holding files TaxonPages actually displays or plays:
 *
 *   thumb         thumbnails in every gallery, table and key
 *   original_png  full image in the gallery panel, viewer and image matrix
 *   original      full image in the carousel and the dichotomous key viewer
 *   image         key figures without an `original`
 *   sound_file    audio in the sounds panel
 *
 * `medium` is deliberately absent: only GalleryMosaic shows it, and that
 * component lives in hand-written pages the sync does not crawl. A mosaic
 * loaded through the proxy still works online.
 */
export const MEDIA_FIELDS = new Set(['thumb', 'original_png', 'original', 'image', 'sound_file'])

const API_PATH = '/api/v1/'

/**
 * Find the media a response refers to.
 *
 * Returns the key the site will request it by — an API key for files served
 * through the API (`original_png` is a path the site appends to its API url),
 * the absolute URL otherwise — the URL to download it from, and the field it
 * was found in (the first one, if several refer to the same file).
 *
 * @param {unknown} data - Parsed response
 * @param {object} options
 * @param {string} options.sourceUrl - Remote API base, no trailing slash
 * @returns {Array<{ key: string, url: string, field: string }>}
 */
export function collectMedia(data, { sourceUrl }) {
  const found = new Map()
  const apiPrefix = `${sourceUrl}/`
  const origin = new URL(sourceUrl).origin

  function add(value, field) {
    if (typeof value !== 'string' || !value) return

    const set = (key, url) => {
      if (!found.has(key)) found.set(key, { url, field })
    }

    if (value.startsWith(API_PATH)) {
      set(apiKey(value.slice(API_PATH.length)), `${origin}${value}`)
    } else if (value.startsWith(apiPrefix)) {
      set(apiKey(value.slice(apiPrefix.length)), value)
    } else if (/^https?:\/\//.test(value)) {
      set(value, value)
    }
  }

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (MEDIA_FIELDS.has(k) && typeof v === 'string') add(v, k)
        else walk(v)
      }
    }
  }

  walk(data)

  return [...found].map(([key, { url, field }]) => ({ key, url, field }))
}

/** The key an API-served file is requested by, without its query. */
function apiKey(pathWithQuery) {
  return normalizePath(pathWithQuery.split('?')[0])
}

/**
 * Save a downloaded file under its content hash and record it.
 *
 * @param {import('./store.js').OfflineStore} store
 * @param {string} key
 * @param {import('./remote.js').RemoteResponse} response
 */
export function saveMedia(store, key, response) {
  if (response.status !== 200 || !response.buffer) {
    store.putMedia(key, { status: response.status })
    return null
  }

  const hash = createHash('sha256').update(response.buffer).digest('hex').slice(0, 32)
  const path = store.mediaPath(hash)

  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, response.buffer)
  }

  store.putMedia(key, {
    hash,
    contentType: response.contentType || 'application/octet-stream',
    size: response.buffer.length,
    status: 200
  })

  return hash
}
