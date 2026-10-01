import { describe, it, expect } from 'vitest'
import { RemoteClient } from '../src/remote.js'
import { describePacing, resolveOfflineConfig } from '../src/config.js'

const SOURCE = 'https://tw.example.org/api/v1'

const sync = (raw) => resolveOfflineConfig({ offline: { sync: raw } }).sync
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fetch that answers after `delay(url)` ms, recording how many were in flight. */
function slowFetch(delay = () => 20, status = () => 200) {
  const seen = { inFlight: 0, max: 0, sent: [] }

  const fetch = async (url) => {
    seen.sent.push(url)
    seen.inFlight += 1
    seen.max = Math.max(seen.max, seen.inFlight)
    await sleep(delay(url))
    seen.inFlight -= 1
    return new Response('{}', { status: status(url), headers: { 'content-type': 'application/json' } })
  }

  return { fetch, seen }
}

describe('RemoteClient pacing', () => {
  it('keeps at most maxInFlight requests at once', async () => {
    const { fetch, seen } = slowFetch()
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 0, maxInFlight: 3, fetch })

    await Promise.all(Array.from({ length: 10 }, (_, i) => remote.get(`/otus/${i}`)))

    expect(seen.max).toBe(3)
    expect(seen.sent).toHaveLength(10)
    expect(remote.inFlight).toBe(0)
  })

  it('sends the next request as soon as one is answered, whatever the others take', async () => {
    const { fetch, seen } = slowFetch((url) => (url.includes('/slow') ? 300 : 10))
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 0, maxInFlight: 2, fetch })

    const started = Date.now()
    const slow = remote.get('/slow')
    await Promise.all(Array.from({ length: 10 }, (_, i) => remote.get(`/quick/${i}`)))
    const quickDone = Date.now() - started
    await slow

    // The quick ones share the other place instead of waiting for the slow one.
    expect(quickDone).toBeLessThan(250)
    expect(seen.max).toBe(2)
  })

  it('also keeps under a rate ceiling', async () => {
    const { fetch } = slowFetch(() => 0)
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 20, maxInFlight: 8, fetch })

    const started = Date.now()
    await Promise.all(Array.from({ length: 5 }, (_, i) => remote.get(`/otus/${i}`)))

    // 5 requests 50 ms apart: the last one leaves after 200 ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(190)
  })

  it('keeps its place while waiting to retry', async () => {
    let failures = 1
    const { fetch, seen } = slowFetch(
      () => 10,
      (url) => (url.includes('/busy') && failures-- > 0 ? 503 : 200)
    )
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 0, maxInFlight: 1, retries: 1, fetch })

    const order = []
    await Promise.all([
      remote.get('/busy').then(() => order.push('busy')),
      remote.get('/other').then(() => order.push('other'))
    ])

    // The retry of /busy goes out before /other gets the place.
    expect(seen.sent.map((url) => new URL(url).pathname.split('/').pop())).toEqual(['busy', 'busy', 'other'])
    expect(order).toEqual(['busy', 'other'])
  })

  it('does not send requests still waiting for a place when stopped', async () => {
    const { fetch, seen } = slowFetch(() => 50)
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 0, maxInFlight: 1, fetch })
    const controller = new AbortController()

    const results = Array.from({ length: 5 }, (_, i) =>
      remote.get(`/otus/${i}`, {}, { signal: controller.signal }).then(
        () => 'done',
        () => 'stopped'
      )
    )
    await sleep(10)
    controller.abort()

    expect(await Promise.all(results)).toEqual(['done', 'stopped', 'stopped', 'stopped', 'stopped'])
    expect(seen.sent).toHaveLength(1)
    expect(remote.inFlight).toBe(0)
  })

  it('spaces requests at a fixed rate without an in-flight limit', async () => {
    const { fetch, seen } = slowFetch(() => 100)
    const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 100, fetch })

    await Promise.all(Array.from({ length: 5 }, (_, i) => remote.get(`/otus/${i}`)))

    // Answers take longer than the spacing: they overlap.
    expect(seen.max).toBeGreaterThan(1)
  })
})

describe('offline.sync', () => {
  it('is adaptive by default', () => {
    const resolved = sync()

    expect(resolved.pacing).toBe('adaptive')
    expect(resolved.api).toEqual({ maxInFlight: 8, requestsPerSecond: 20 })
    expect(resolved.media).toEqual({ maxInFlight: 0, requestsPerSecond: 0 })
    expect(resolved.parallelDownloads).toBe(4)
  })

  it('scales the default ceiling with the requests at a time', () => {
    expect(sync({ parallel_requests: 32 }).api).toEqual({ maxInFlight: 32, requestsPerSecond: 80 })
    expect(sync({ parallel_requests: 32, max_requests_per_second: 30 }).api.requestsPerSecond).toBe(30)
  })

  it('takes the requests at a time and the ceiling, 0 for none', () => {
    expect(sync({ parallel_requests: 4, max_requests_per_second: 0 }).api).toEqual({
      maxInFlight: 4,
      requestsPerSecond: 0
    })
  })

  it('paces at a fixed rate when asked', () => {
    const resolved = sync({ pacing: 'fixed', requests_per_second: 5, downloads_per_second: 2, parallel_downloads: 3 })

    expect(resolved.api).toEqual({ maxInFlight: 0, requestsPerSecond: 5 })
    expect(resolved.media).toEqual({ maxInFlight: 0, requestsPerSecond: 2 })
    expect(resolved.parallelDownloads).toBe(3)
  })

  it('falls back to the defaults for values it cannot use', () => {
    const resolved = sync({ pacing: 'turbo', parallel_requests: -2, max_requests_per_second: 'x', requests_per_second: 0 })

    expect(resolved.pacing).toBe('adaptive')
    expect(resolved.parallelRequests).toBe(8)
    expect(resolved.maxRequestsPerSecond).toBe(20)
    expect(resolved.requestsPerSecond).toBe(8)
  })

  it('syncs enough pages at once to keep the requests busy', () => {
    expect(sync().pages).toBe(16)
    expect(sync({ parallel_requests: 20 }).pages).toBe(40)
    expect(sync({ pacing: 'fixed', requests_per_second: 30 }).pages).toBe(60)
  })

  it('describes the pacing for the log', () => {
    expect(describePacing(sync())).toBe('adaptive, 8 requests at a time, at most 20 per second; 4 downloads at a time')
    expect(describePacing(sync({ max_requests_per_second: 0 }))).toBe('adaptive, 8 requests at a time; 4 downloads at a time')
    expect(describePacing(sync({ pacing: 'fixed' }))).toBe(
      'fixed, 8 requests per second; 4 downloads at a time, 8 per second'
    )
  })
})
