import { serializeParams } from './params.js'

/** Response headers worth keeping: the site reads pagination from them. */
const KEPT_HEADERS = /^(content-type|content-disposition|pagination-.*)$/i

const RETRY_STATUS = new Set([429, 502, 503, 504])

/**
 * Client for the remote TaxonWorks API, shared by the sync and the proxy mode.
 *
 * Two limits pace the requests, either or both:
 *   - `maxInFlight`: at most that many requests at once. The next one is sent
 *     as soon as one is answered, so the pace follows how fast the server
 *     answers: quick answers free their place quickly, a slow one holds only
 *     its own, and a busy server is sent fewer.
 *   - `requestsPerSecond`: requests spaced to stay under that rate, however
 *     long the answers take.
 *
 * Transient failures (network errors, 429, 502-504) are retried with
 * exponential backoff, honoring Retry-After when the server sends it. A
 * request keeps its place while it waits to retry, so a struggling server is
 * not sent more.
 */
export class RemoteClient {
  /**
   * @param {object} options
   * @param {string} options.url - API base, e.g. https://sfg.taxonworks.org/api/v1
   * @param {string} options.token - Project token
   * @param {number} [options.requestsPerSecond] - 0: no limit
   * @param {number} [options.maxInFlight] - 0: no limit
   * @param {number} [options.retries]
   * @param {number} [options.timeout] - Per request, in ms
   * @param {typeof fetch} [options.fetch]
   */
  constructor({
    url,
    token,
    requestsPerSecond = 8,
    maxInFlight = 0,
    retries = 3,
    timeout = 120000,
    fetch = globalThis.fetch
  }) {
    if (!url) throw new Error('No TaxonWorks API url configured (config/api.yml)')

    this.url = url.replace(/\/+$/, '')
    this.token = token
    this.interval = requestsPerSecond > 0 ? 1000 / requestsPerSecond : 0
    this.maxInFlight = maxInFlight > 0 ? maxInFlight : Infinity
    this.retries = retries
    this.timeout = timeout
    this.fetch = fetch
    this.nextSlot = 0
    this.requestCount = 0
    this.inFlight = 0
    this.waiting = []
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
  get(path, params, options) {
    return this.request(path, serializeParams(params), options)
  }

  /**
   * GET an API path with already serialized query pairs.
   *
   * @param {string} path
   * @param {Array<[string, string]>} pairs
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<RemoteResponse>}
   */
  async request(path, pairs = [], options) {
    return this.fetchUrl(this.buildUrl(path, pairs), path, options)
  }

  /**
   * GET an absolute URL (media files) with the same pacing and retries.
   *
   * With a `signal`, a request still waiting for its place or its slot when
   * the signal is aborted is not sent: many requests queue behind the
   * pacing, and stopping should not have to wait for all of them.
   *
   * @param {string} url
   * @param {string} [pathHint]
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<RemoteResponse>}
   */
  async fetchUrl(url, pathHint = url, { signal } = {}) {
    // Files served through the API (original images) need the token too.
    if (url.startsWith(`${this.url}/`) && this.token && !/[?&]project_token=/.test(url)) {
      url += `${url.includes('?') ? '&' : '?'}project_token=${encodeURIComponent(this.token)}`
    }

    await this.acquire(signal)

    // The place is held until the body is read: a large answer still
    // downloading is still a request in flight.
    try {
      return await this.send(url, pathHint, signal)
    } finally {
      this.release()
    }
  }

  /** Send a request in the place it holds, retrying transient failures. */
  async send(url, pathHint, signal) {
    let attempt = 0

    for (;;) {
      await this.waitForSlot()
      signal?.throwIfAborted()

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

  /**
   * Wait for a place among the requests in flight. Rejects, and gives up its
   * turn, when the signal is aborted first.
   *
   * @param {AbortSignal} [signal]
   */
  acquire(signal) {
    signal?.throwIfAborted()

    if (this.inFlight < this.maxInFlight) {
      this.inFlight += 1
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const waiter = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = () => {
        this.waiting.splice(this.waiting.indexOf(waiter), 1)
        reject(signal.reason)
      }

      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiting.push(waiter)
    })
  }

  /** Free a place: handed straight to the next request waiting, if any. */
  release() {
    const next = this.waiting.shift()
    if (next) next()
    else this.inFlight -= 1
  }

  async waitForSlot() {
    if (!this.interval) return

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
