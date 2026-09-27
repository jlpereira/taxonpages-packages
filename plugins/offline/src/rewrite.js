import { API_PREFIX, MEDIA_PREFIX } from './config.js'

/**
 * Point the URLs inside a stored response at this server.
 *
 * Done when serving rather than when storing, so the database stays a faithful
 * copy of what TaxonWorks returned and media downloaded later is picked up by
 * responses stored earlier.
 *
 *   - An absolute URL into the source API (DwC `associatedMedia`, links the
 *     site follows as-is) becomes the same path under the local API.
 *   - An absolute URL whose file was downloaded (thumbnails, sounds) becomes
 *     the local copy.
 *
 * Anything else is left alone, so what was not downloaded still loads from
 * the network when there is one.
 *
 * @param {unknown} value
 * @param {object} options
 * @param {string} options.sourceUrl - Remote API base, no trailing slash
 * @param {(url: string) => ({ hash: string|null }|null)} [options.findMedia]
 */
export function rewriteUrls(value, { sourceUrl, findMedia }) {
  const apiPrefix = sourceUrl ? `${sourceUrl}/` : null

  function rewrite(text) {
    if (!text.startsWith('http')) return text

    const media = findMedia?.(text)
    if (media?.hash) return `${MEDIA_PREFIX}/${media.hash}`

    if (apiPrefix && text.startsWith(apiPrefix)) {
      return `${API_PREFIX}/${text.slice(apiPrefix.length)}`
    }

    return text
  }

  function walk(node) {
    if (typeof node === 'string') return rewrite(node)
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(node)) out[k] = walk(v)
      return out
    }
    return node
  }

  return walk(value)
}
