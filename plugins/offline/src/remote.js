import { serializeParams } from './params.js'

/** Response headers worth keeping: the site reads pagination from them. */
const KEPT_HEADERS = /^(content-type|content-disposition|pagination-.*)$/i

const RETRY_STATUS = new Set([429, 502, 503, 504])

/**
 * Client for the remote TaxonWorks API, shared by the sync and the proxy mode.
 *
 * Requests are spaced to stay under `requestsPerSecond` however many are in
 * flight, and transient failures (network errors, 429, 502-504) are retried
 * with exponential backoff, honoring Retry-After when the server sends it.
 */
export class RemoteClient {
  /**
   * @param {object} options
   * @param {string} options.url - API base, e.g. https://sfg.taxonworks.org/api/v1
   * @param {string} options.token - Project token
   * @param {number} [options.requestsPerSecond]
   * @param {number} [options.retries]
   * @param {number} [options.timeout] - Per request, in ms
   * @param {typeof fetch} [options.fetch]
   */
  constructor({ url, token, requestsPerSecond = 8, retries = 3, timeout = 120000, fetch = globalThis.fetch }) {
    if (!url) throw new Error('No TaxonWorks API url configured (config/api.yml)')

    this.url = url.replace(/\/+$/, '')
    this.token = token
    this.interval = 1000 / requestsPerSecond
    this.retries = retries
    this.timeout = timeout
    this.fetch = fetch
    this.nextSlot = 0
    this.requestCount = 0
  }

  /**
   * Build the remote URL for an API path.
   *
   * @param {string} path
   * @param {Array<[string, string]>} pairs
   */
  buildUrl(path, pairs = []) {
    const query = new URLSearchParams(pairs.filter(([k]) => k !== 'project_token'))
    if (this.token) query.set('project_token', this.token)

    const cleanPath = path.replace(/^\/+/, '')
    const search = query.toString()

    return `${this.url}/${cleanPath}${search ? `?${search}` : ''}`
  }

  /**
   * GET an API path with a params object, serialized the way the site does.
   *
   * @param {string} path
   * @param {object} [params]
   */
  get(path, params) {
    return this.request(path, serializeParams(params))
  }

  /**
   * GET an API path with already serialized query pairs.
   *
   * @param {string} path
   * @param {Array<[string, string]>} pairs
   * @returns {Promise<RemoteResponse>}
   */
  async request(path, pairs = []) {
    return this.fetchUrl(this.buildUrl(path, pairs), path)
  }

  /**
   * GET an absolute URL (media files) with the same pacing and retries.
   *
   * @param {string} url
   * @returns {Promise<RemoteResponse>}
   */
  async fetchUrl(url, pathHint = url) {
    // Files served through the API (original images) need the token too.
    if (url.startsWith(`${this.url}/`) && this.token && !/[?&]project_token=/.test(url)) {
      url += `${url.includes('?') ? '&' : '?'}project_token=${encodeURIComponent(this.token)}`
    }

    let attempt = 0

    for (;;) {
      await this.waitForSlot()

      try {
        const response = await this.fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(this.timeout),
          headers: { Accept: 'application/json, */*' }
        })

        this.requestCount += 1

        if (RETRY_STATUS.has(response.status) && attempt < this.retries) {
          attempt += 1
          await sleep(retryDelay(response, attempt))
          continue
        }

        return readResponse(response, pathHint)
      } catch (err) {
        if (attempt >= this.retries) throw err
        attempt += 1
        await sleep(backoff(attempt))
      }
    }
  }

  async waitForSlot() {
    const now = Date.now()
    const slot = Math.max(now, this.nextSlot)
    this.nextSlot = slot + this.interval
    if (slot > now) await sleep(slot - now)
  }
}

/**
 * @typedef {object} RemoteResponse
 * @property {number} status
 * @property {Record<string, string>} headers - Only the kept headers
 * @property {'json'|'text'|'binary'} kind
 * @property {unknown} [data]
 * @property {string} [text]
 * @property {Buffer} [buffer]
 * @property {string} contentType
 */

async function readResponse(response, path) {
  const headers = {}
  response.headers.forEach((value, name) => {
    if (KEPT_HEADERS.test(name)) headers[name.toLowerCase()] = value
  })

  const contentType = response.headers.get('content-type') || ''
  const result = { status: response.status, headers, contentType }

  if (isJson(contentType, path)) {
    const text = await response.text()
    try {
      return { ...result, kind: 'json', data: text ? JSON.parse(text) : null }
    } catch {
      return { ...result, kind: 'text', text }
    }
  }

  if (/^text\//i.test(contentType)) {
    return { ...result, kind: 'text', text: await response.text() }
  }

  return { ...result, kind: 'binary', buffer: Buffer.from(await response.arrayBuffer()) }
}

function isJson(contentType, path) {
  return /json/i.test(contentType) || /\.(geo)?json(\?|$)/.test(path)
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'))
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt)
}

function backoff(attempt) {
  return Math.min(30000, 1000 * 2 ** (attempt - 1))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
