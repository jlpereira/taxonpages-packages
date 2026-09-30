import { existsSync } from 'node:fs'
import { saveMedia } from '../media.js'

/**
 * Downloads the media files stored responses refer to, apart from the
 * requests of OTU pages: full-size images are most of a sync's bytes and
 * requests, and a page no longer waits for its images before moving on.
 *
 * Every file is recorded in the store's `media_queue` before it is
 * downloaded and removed once saved, so files left when a sync is stopped are
 * downloaded when it is resumed. A file whose download fails stays queued for
 * the next run; it is not retried in this one.
 *
 * With a converter, images of the fields it applies to are converted before
 * they are stored (see images.js).
 *
 * @param {object} options
 * @param {import('../store.js').OfflineStore} options.store
 * @param {import('../remote.js').RemoteClient} options.remote - Its own client,
 *   so media do not use the API's request budget
 * @param {number} options.concurrency
 * @param {import('../images.js').ImageConverter|null} [options.converter]
 * @param {AbortSignal} [options.signal]
 * @param {() => void} [options.onSaved]
 * @param {{ warn: Function }} [options.logger]
 */
export function createMediaQueue({
  store,
  remote,
  concurrency,
  converter = null,
  signal,
  onSaved = () => {},
  logger = console
}) {
  const pending = []
  const seen = new Set()
  const conversion = { files: 0, bytesBefore: 0, bytesAfter: 0 }
  let active = 0
  let idle = null

  function add(key, url, field = null) {
    if (seen.has(key)) return
    seen.add(key)

    const existing = store.getMedia(key)
    if (existing?.hash && existsSync(store.mediaPath(existing.hash))) {
      store.unqueueMedia(key)
      return
    }

    store.queueMedia(key, url, field)
    pending.push({ key, url, field })
    pump()
  }

  function pump() {
    while (active < concurrency && pending.length && !signal?.aborted) {
      const item = pending.shift()
      active += 1
      download(item).finally(() => {
        active -= 1
        pump()
      })
    }

    if (active === 0 && (pending.length === 0 || signal?.aborted) && idle) {
      idle.resolve()
      idle = null
    }
  }

  async function download({ key, url, field }) {
    try {
      const response = await remote.fetchUrl(url, url, { signal })
      if (saveMedia(store, key, await convert(response, field, url))) onSaved()
      store.unqueueMedia(key)
    } catch (err) {
      if (!signal?.aborted) logger.warn(`Media ${url}: ${err.message}`)
    }
  }

  /** The response with its image converted, when it is one to convert. */
  async function convert(response, field, url) {
    if (!converter || response.status !== 200 || !response.buffer || !converter.appliesTo(field)) return response

    try {
      const result = await converter.convert(response.buffer, response.contentType)
      if (!result.converted) return response

      conversion.files += 1
      conversion.bytesBefore += response.buffer.length
      conversion.bytesAfter += result.buffer.length

      return { ...response, buffer: result.buffer, contentType: result.contentType }
    } catch (err) {
      // Kept as downloaded: an image the site can show beats none.
      logger.warn(`Media ${url}: not converted (${err.message})`)
      return response
    }
  }

  return {
    /** Queue a file, unless it is already downloaded or queued in this run. */
    add,

    /**
     * Queue the files a previous run left, those of the fields `wanted`
     * accepts; the others are forgotten.
     *
     * @param {(field: string|null) => boolean} [wanted]
     */
    resume(wanted = () => true) {
      for (const { key, url, field } of store.queuedMedia()) {
        if (wanted(field)) add(key, url, field)
        else store.unqueueMedia(key)
      }
    },

    get pending() {
      return pending.length + active
    },

    /** Images converted in this session, and their bytes before and after. */
    get conversion() {
      return { ...conversion }
    },

    /** Resolves when every queued file is done, or when stopped. */
    drain() {
      if (active === 0 && (pending.length === 0 || signal?.aborted)) return Promise.resolve()
      idle ??= Promise.withResolvers()
      return idle.promise
    }
  }
}
