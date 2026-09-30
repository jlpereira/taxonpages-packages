import { readFileSync, rmSync } from 'node:fs'
import { collectMedia, saveMedia } from './media.js'
import { createImageConverter } from './images.js'

/**
 * Convert the images already downloaded, as `offline.images` says: for a
 * database synced before a conversion was configured, or with other settings.
 *
 * Which files to convert is found the way the sync finds them, from the
 * fields of stored responses. Images that already match the settings are
 * left alone, so running it again does nothing more. A converted file
 * replaces the downloaded one, which is deleted once no key refers to it.
 *
 * @param {object} options
 * @param {import('./store.js').OfflineStore} options.store
 * @param {ReturnType<import('./config.js').resolveOfflineConfig>} options.config
 * @param {number} [options.concurrency]
 * @param {(progress: { done: number, total: number }) => void} [options.onProgress]
 * @param {{ warn: Function }} [options.logger]
 * @returns {Promise<{ total: number, converted: number, bytesBefore: number, bytesAfter: number }>}
 */
export async function convertStoredImages({ store, config, concurrency = 4, onProgress = () => {}, logger = console }) {
  const converter = await createImageConverter(config.images)
  if (!converter) throw new Error('offline.images.format is "original": there is nothing to convert to.')

  const keys = new Set()
  for (const key of store.jsonResponseKeys()) {
    const { data } = store.getResponse(key)
    for (const { key: mediaKey, field } of collectMedia(data, { sourceUrl: config.source.url })) {
      if (converter.appliesTo(field)) keys.add(mediaKey)
    }
  }

  const queue = [...keys].filter((key) => store.getMedia(key)?.hash)
  const result = { total: queue.length, converted: 0, bytesBefore: 0, bytesAfter: 0 }
  let done = 0

  async function convertOne(key) {
    const media = store.getMedia(key)
    const path = store.mediaPath(media.hash)

    let buffer
    try {
      buffer = readFileSync(path)
    } catch {
      return // not on disk: the sync downloads it again
    }

    const output = await converter.convert(buffer, media.content_type)
    if (!output.converted) return

    saveMedia(store, key, { status: 200, buffer: output.buffer, contentType: output.contentType })

    // The same file can be stored under several keys: keep it while any
    // still refers to it.
    if (!store.getMediaByHash(media.hash)) rmSync(path, { force: true })

    result.converted += 1
    result.bytesBefore += buffer.length
    result.bytesAfter += output.buffer.length
  }

  async function worker() {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      try {
        await convertOne(key)
      } catch (err) {
        logger.warn(`${key}: not converted (${err.message})`)
      }
      done += 1
      onProgress({ done, total: result.total })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  return result
}
