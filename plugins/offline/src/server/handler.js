import { createReadStream } from 'node:fs'
import { canonicalKey, keyFor, normalizePath } from '../params.js'
import { rewriteUrls } from '../rewrite.js'
import { saveMedia } from '../media.js'
import { serve } from '../recipes/index.js'

const NOT_AVAILABLE = {
  success: false,
  message: 'Not available offline'
}

/**
 * Request handlers for the local API and the media it references.
 *
 * Plain Node (req, res, next) handlers, so they mount the same way on the
 * Express server of `dev:ssr`/`serve` and on Vite's connect server in `dev`.
 * Both strip the mount prefix from `req.url`.
 *
 * Resolution order for an API request:
 *   1. search endpoints, answered from the search tables
 *   2. a file served through the API (original images)
 *   3. the stored response
 *   4. proxy mode: the remote API, stored for next time if `proxyStore`
 *   5. 404, recorded in the miss log
 *
 * @param {object} options
 * @param {ReturnType<import('../config.js').resolveOfflineConfig>} options.config
 * @param {import('../store.js').OfflineStore} options.store
 * @param {import('../remote.js').RemoteClient|null} options.remote - Null outside proxy mode
 * @param {ReturnType<import('../misses.js').createMissLogger>} options.logMiss
 * @param {{ error: Function }} [options.logger]
 */
export function createHandlers({ config, store, remote, logMiss, logger = console }) {
  const sourceUrl = config.source.url
  const findMedia = (url) => store.getMedia(url)

  async function api(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next ? next() : sendJson(res, 405, NOT_AVAILABLE)

    const url = new URL(req.url, 'http://offline.local')
    const path = normalizePath(url.pathname)
    const key = canonicalKey(url.pathname, url.searchParams)

    try {
      const searched = serve(path, url.searchParams, store)
      if (searched) return sendJson(res, searched.status, searched.data, searched.headers, req)

      const media = store.getMedia(key)
      if (media?.hash) return sendFile(res, store.mediaPath(media.hash), media.content_type, req)

      const stored = store.getResponse(key)
      if (stored) return sendStored(res, stored, req, path)

      if (remote) {
        const proxied = await proxy(key, url)
        if (proxied) return proxied(res, req)
      }

      logMiss(key, 'none')
      return sendJson(res, 404, NOT_AVAILABLE, {}, req)
    } catch (err) {
      logger.error(`Failed to answer ${key}:`, err.message)
      return sendJson(res, 500, { success: false, message: 'Offline API error' }, {}, req)
    }
  }

  /**
   * Fetch a missing request from the remote API. Returns a sender, or null
   * when the remote is unreachable so the caller falls back to a 404.
   */
  async function proxy(key, url) {
    let response
    try {
      response = await remote.request(url.pathname, [...url.searchParams])
    } catch {
      return null
    }

    logMiss(key, 'proxy', response.status)

    const keep = config.proxyStore && response.status < 500

    if (response.kind === 'binary') {
      if (keep && config.media && response.status === 200) saveMedia(store, key, response)
      return (res, req) => sendBuffer(res, response.status, response.buffer, response.contentType, req)
    }

    if (keep) {
      store.putResponse(key, {
        status: response.status,
        headers: response.headers,
        ...(response.kind === 'json' ? { data: response.data } : { text: response.text }),
        source: 'proxy'
      })
    }

    return (res, req) =>
      sendStored(
        res,
        {
          status: response.status,
          headers: response.headers,
          kind: response.kind,
          data: response.data,
          text: response.text
        },
        req
      )
  }

  function media(req, res, next) {
    const hash = decodeURIComponent(new URL(req.url, 'http://offline.local').pathname).replace(/^\/+/, '')

    if (!/^[0-9a-f]{32}$/.test(hash)) return next ? next() : sendJson(res, 404, NOT_AVAILABLE)

    const row = store.getMediaByHash(hash)
    if (!row) return sendJson(res, 404, NOT_AVAILABLE, {}, req)

    // Content-addressed: the bytes behind a hash never change.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return sendFile(res, store.mediaPath(hash), row.content_type, req)
  }

  /**
   * In strict mode, drop the id of breadcrumb parents whose page is not in the
   * database, so the site shows them as text instead of links that would end
   * in "not available". Done here rather than when storing, so the database
   * stays a copy of what TaxonWorks returned, and the links come back by
   * themselves once those pages are synced. In proxy mode they stay: the
   * pages load from TaxonWorks.
   */
  function withReachableParents(path, data) {
    if (remote || !/^otus\/\d+$/.test(path)) return data
    if (!data?.parents || typeof data.parents !== 'object') return data

    const parents = {}

    for (const [name, records] of Object.entries(data.parents)) {
      parents[name] = Array.isArray(records)
        ? records.map((record) => (isReachable(record?.id) ? record : withoutId(record)))
        : records
    }

    return { ...data, parents }
  }

  function isReachable(otuId) {
    return otuId != null && store.hasResponse(keyFor(`/otus/${otuId}`, { extend: ['parents'] }))
  }

  function sendStored(res, stored, req, path = '') {
    if (stored.kind === 'text') {
      return sendBuffer(
        res,
        stored.status,
        Buffer.from(stored.text ?? '', 'utf8'),
        stored.headers['content-type'] || 'text/plain; charset=utf-8',
        req,
        stored.headers
      )
    }

    const data = rewriteUrls(withReachableParents(path, stored.data), { sourceUrl, findMedia })
    return sendJson(res, stored.status, data, stored.headers, req)
  }

  return { api, media }
}

function withoutId(record) {
  if (!record || typeof record !== 'object') return record
  const { id, ...rest } = record
  return rest
}

function sendJson(res, status, data, headers = {}, req) {
  const body = Buffer.from(JSON.stringify(data ?? null), 'utf8')
  const type = /json/i.test(headers['content-type'] || '')
    ? headers['content-type']
    : 'application/json; charset=utf-8'

  return sendBuffer(res, status, body, type, req, headers)
}

function sendBuffer(res, status, body, contentType, req, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    if (name !== 'content-type') res.setHeader(name, value)
  }

  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', body.length)
  res.end(req?.method === 'HEAD' ? undefined : body)
}

function sendFile(res, path, contentType, req) {
  res.statusCode = 200
  res.setHeader('Content-Type', contentType || 'application/octet-stream')

  if (req?.method === 'HEAD') return res.end()

  const stream = createReadStream(path)
  stream.on('error', () => {
    if (!res.headersSent) sendJson(res, 404, NOT_AVAILABLE, {}, req)
    else res.destroy()
  })
  stream.pipe(res)
}
