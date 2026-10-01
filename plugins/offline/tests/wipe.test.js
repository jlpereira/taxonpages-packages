import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OfflineStore } from '../src/store.js'
import { wipeDatabase } from '../src/wipe.js'
import { tempDir } from './helpers.js'

function syncedDatabase() {
  const dir = tempDir()
  const config = { database: join(dir, 'offline.db'), mediaDir: join(dir, 'media') }
  const store = new OfflineStore(config.database, { mediaDir: config.mediaDir })

  store.putResponse('otus/1', { status: 200, data: { id: 1, list: Array.from({ length: 300 }, (_, i) => i) } })
  store.putOtu({ id: 1, taxon_name_id: 10, object_tag: 'Aphis fabae' }, 'Aphis fabae')
  store.putMedia('images/1', { hash: 'a'.repeat(32), contentType: 'image/png', size: 3, status: 200 })
  store.setMeta('sync.run', { id: 1 })

  mkdirSync(join(config.mediaDir, 'aa'), { recursive: true })
  writeFileSync(join(config.mediaDir, 'aa', 'a'.repeat(32)), 'png')

  return { config, store }
}

describe('wipeDatabase', () => {
  it('empties the database and deletes the media files', () => {
    const { config, store } = syncedDatabase()
    store.close()

    wipeDatabase(config)

    const reopened = OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })
    expect(reopened.stats()).toMatchObject({ responses: 0, blobs: 0, media: 0, otus: 0 })
    expect(reopened.searchOtus('aphis*', 10)).toEqual([])
    expect(reopened.getMeta('sync.run')).toBeUndefined()
    expect(existsSync(config.mediaDir)).toBe(false)
    reopened.close()
  })

  it('is seen at once by a server that has the database open', () => {
    const { config, store } = syncedDatabase()

    wipeDatabase(config)

    expect(store.getResponse('otus/1')).toBeNull()
    expect(store.getMedia('images/1')).toBeNull()
    store.close()
  })

  it('deletes a database it cannot open', () => {
    const dir = tempDir()
    const config = { database: join(dir, 'offline.db'), mediaDir: join(dir, 'media') }
    writeFileSync(config.database, 'not a database')

    wipeDatabase(config)

    expect(existsSync(config.database)).toBe(false)
  })
})
