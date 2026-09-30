import { rmSync } from 'node:fs'

/**
 * Delete what the database holds for datasets now left out
 * (`offline.include`): the responses and files recorded only under them —
 * one another dataset also needs is kept — and the bibliography or news
 * tables when those are left out. Then the shared pieces nothing refers to
 * any more are deleted, and the file compacted.
 *
 * Data synced before datasets were recorded is not recorded under any, and is
 * kept: sync again to record it.
 *
 * @param {object} options
 * @param {import('./store.js').OfflineStore} options.store
 * @param {import('./datasets.js').Datasets} options.datasets
 * @returns {{ datasets: string[], responses: number, media: number, files: number, blobs: number, tables: string[] }}
 */
export function pruneDatasets({ store, datasets }) {
  const excluded = datasets.list.filter((dataset) => !dataset.included).map((dataset) => dataset.id)
  const result = { datasets: excluded, responses: 0, media: 0, files: 0, blobs: 0, tables: [] }

  if (!excluded.length) return result

  const responses = store.itemsOnlyIn(excluded, 'response')
  const media = store.itemsOnlyIn(excluded, 'media')
  const hashes = new Set()

  store.transaction(() => {
    for (const key of responses) store.deleteItem('response', key)

    for (const key of media) {
      const hash = store.getMedia(key)?.hash
      if (hash) hashes.add(hash)
      store.deleteItem('media', key)
      store.unqueueMedia(key)
    }

    for (const [dataset, table] of [
      ['project:bibliography', 'sources'],
      ['project:news', 'news']
    ]) {
      if (excluded.includes(dataset)) {
        store.clearTable(table)
        result.tables.push(table)
      }
    }
  })

  // A file stays while any key still refers to it.
  for (const hash of hashes) {
    if (store.getMediaByHash(hash)) continue
    rmSync(store.mediaPath(hash), { force: true })
    result.files += 1
  }

  result.responses = responses.length
  result.media = media.length
  result.blobs = store.collectGarbage()

  return result
}
