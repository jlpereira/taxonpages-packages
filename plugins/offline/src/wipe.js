import { rmSync } from 'node:fs'
import { OfflineStore } from './store.js'

/**
 * Delete everything a sync stored: the database contents and the media files.
 *
 * The database is emptied in place rather than deleted: a site server running
 * meanwhile keeps it open, and would go on reading a deleted file (on
 * Windows, it would keep it from being deleted). One that cannot be opened,
 * written by another version of the plugin, is deleted: no server can be
 * reading it.
 *
 * @param {ReturnType<import('./config.js').resolveOfflineConfig>} config
 */
export function wipeDatabase(config) {
  let store = null
  try {
    store = OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })
  } catch {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.database}${suffix}`, { force: true })
  }

  if (store) {
    try {
      store.wipe()
    } finally {
      store.close()
    }
  }

  rmSync(config.mediaDir, { recursive: true, force: true })
}
