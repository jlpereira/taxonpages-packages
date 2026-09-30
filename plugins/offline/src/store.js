import { mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'
import { deflate, inflate, hashText, blobRefs } from './refs.js'
import { stripTags } from './text.js'

/**
 * `node:sqlite` is still flagged experimental and warns once on first import.
 * The warning is noise for users of this plugin, so it is filtered for this
 * module only; every other warning passes through.
 */
async function loadSqlite() {
  const original = process.emitWarning
  process.emitWarning = (warning, ...args) => {
    const text = typeof warning === 'string' ? warning : warning?.message
    if (/SQLite/i.test(text || '')) return
    return original.call(process, warning, ...args)
  }

  try {
    return await import('node:sqlite')
  } finally {
    process.emitWarning = original
  }
}

const { DatabaseSync } = await loadSqlite()

const SCHEMA_VERSION = 2

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- One row per request the site can make. The body is the deflated JSON (see
-- refs.js), brotli-compressed; plain text bodies (CSV) are only compressed.
CREATE TABLE IF NOT EXISTS responses (
  key TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  headers TEXT NOT NULL,
  kind TEXT NOT NULL,
  body BLOB,
  source TEXT NOT NULL,
  run INTEGER,
  fetched_at INTEGER NOT NULL
);

-- Pieces shared between responses, addressed by content.
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  body BLOB NOT NULL
);

-- Media files, keyed by the URL the site asks for: an absolute URL for
-- thumbnails and sounds, an API key for images served by the API.
CREATE TABLE IF NOT EXISTS media (
  url TEXT PRIMARY KEY,
  hash TEXT,
  content_type TEXT,
  size INTEGER,
  status INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Media found in stored responses and not downloaded yet: the key the site
-- requests it by, the URL to download it from, and the response field it was
-- found in (which decides whether it is converted). Kept across runs, so an
-- interrupted sync downloads them when resumed. The server never reads it.
CREATE TABLE IF NOT EXISTS media_queue (
  url TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  field TEXT
);

-- The dataset each stored response ('response', by key) and file ('media', by
-- the key the site requests it by) was synced for; one item can serve
-- several. Used to measure datasets and to prune those left out. The server
-- never reads it.
CREATE TABLE IF NOT EXISTS dataset_items (
  dataset TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  PRIMARY KEY (dataset, kind, key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS dataset_items_key ON dataset_items (kind, key);

-- Search tables, for endpoints that take free-text queries.
CREATE TABLE IF NOT EXISTS otus (
  id INTEGER PRIMARY KEY,
  taxon_name_id INTEGER,
  label_html TEXT,
  sort_name TEXT,
  record BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS otus_sort_name ON otus (sort_name);

CREATE VIRTUAL TABLE IF NOT EXISTS otus_fts USING fts5(
  name,
  content='',
  contentless_delete=1,
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  cached TEXT,
  author TEXT,
  year INTEGER,
  in_project INTEGER NOT NULL DEFAULT 1,
  record BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS sources_cached ON sources (cached);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  created_at TEXT,
  record BLOB NOT NULL
);

-- Progress of a sync run, so an interrupted one resumes where it stopped.
CREATE TABLE IF NOT EXISTS sync_otus (
  otu_id INTEGER PRIMARY KEY,
  run INTEGER NOT NULL,
  done_at INTEGER,
  error TEXT
);
`

const BROTLI = {
  params: {
    // Quality 11 (the default) is several times slower for a few percent;
    // the sync writes hundreds of thousands of bodies.
    [constants.BROTLI_PARAM_QUALITY]: 5
  }
}

const BLOB_CACHE_SIZE = 2000

/** JSON records in the search tables are stored compressed: ~5x smaller. */
const packJson = (value) => brotliCompressSync(JSON.stringify(value), BROTLI)
const unpackJson = (buffer) => JSON.parse(brotliDecompressSync(buffer).toString('utf8'))

export class OfflineStore {
  /**
   * @param {string} path - SQLite file. Its directory is created if missing.
   * @param {object} [options]
   * @param {string} [options.mediaDir]
   * @param {boolean} [options.readOnly]
   */
  constructor(path, { mediaDir, readOnly = false } = {}) {
    if (!readOnly) mkdirSync(dirname(path), { recursive: true })

    this.path = path
    this.mediaDir = mediaDir || join(dirname(path), 'media')
    this.db = new DatabaseSync(path, { readOnly })
    this.blobCache = new Map()

    // The site server and a sync may have the database open at once; wait for
    // the other writer instead of failing.
    this.db.exec('PRAGMA busy_timeout = 10000')

    this.checkSchemaVersion()

    if (!readOnly) {
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
      this.db.exec(SCHEMA)
    }

    this.prepare()

    if (!readOnly) this.setMeta('schema_version', SCHEMA_VERSION)
  }

  /**
   * Refuse a database written with a different layout rather than misread it.
   * There are no migrations: the database is a cache of the remote API and is
   * rebuilt by syncing again.
   */
  checkSchemaVersion() {
    if (!this.hasTable('meta')) return

    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()
    const version = row ? JSON.parse(row.value) : null

    if (version !== null && version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(
        `${this.path} was created by another version of the offline plugin ` +
          `(schema ${version}, expected ${SCHEMA_VERSION}). Delete it and run \`taxonpages offline:sync\` again.`
      )
    }
  }

  hasTable(name) {
    return Boolean(
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
    )
  }

  /**
   * Open a database only if it exists, without creating one.
   *
   * @param {string} path
   * @param {object} [options]
   * @returns {OfflineStore|null}
   */
  static openExisting(path, options = {}) {
    return existsSync(path) ? new OfflineStore(path, options) : null
  }

  prepare() {
    const q = (sql) => this.db.prepare(sql)

    this.stmt = {
      getMeta: q('SELECT value FROM meta WHERE key = ?'),
      setMeta: q('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      getResponse: q('SELECT status, headers, kind, body FROM responses WHERE key = ?'),
      getResponseRun: q('SELECT run FROM responses WHERE key = ?'),
      hasResponse: q('SELECT 1 AS found FROM responses WHERE key = ? AND status < 400'),
      putResponse: q(`INSERT INTO responses (key, status, headers, kind, body, source, run, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET status = excluded.status, headers = excluded.headers,
          kind = excluded.kind, body = excluded.body, source = excluded.source,
          run = excluded.run, fetched_at = excluded.fetched_at`),
      getBlob: q('SELECT body FROM blobs WHERE hash = ?'),
      putBlob: q('INSERT OR IGNORE INTO blobs (hash, body) VALUES (?, ?)'),
      getMedia: q('SELECT hash, content_type, size, status FROM media WHERE url = ?'),
      getMediaByHash: q('SELECT content_type, size FROM media WHERE hash = ? LIMIT 1'),
      countTable: q(`SELECT (SELECT COUNT(*) FROM otus) AS otus, (SELECT COUNT(*) FROM sources) AS sources,
        (SELECT COUNT(*) FROM news) AS news`),
      putNews: q(`INSERT INTO news (id, created_at, record) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, record = excluded.record`),
      putMedia: q(`INSERT INTO media (url, hash, content_type, size, status, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET hash = excluded.hash, content_type = excluded.content_type,
          size = excluded.size, status = excluded.status, fetched_at = excluded.fetched_at`),
      putOtu: q(`INSERT INTO otus (id, taxon_name_id, label_html, sort_name, record) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET taxon_name_id = excluded.taxon_name_id,
          label_html = excluded.label_html, sort_name = excluded.sort_name, record = excluded.record`),
      listOtus: q('SELECT record FROM otus ORDER BY sort_name, id LIMIT ? OFFSET ?'),
      deleteOtuFts: q('DELETE FROM otus_fts WHERE rowid = ?'),
      putOtuFts: q('INSERT INTO otus_fts (rowid, name) VALUES (?, ?)'),
      searchOtus: q(`SELECT o.id, o.record, o.label_html FROM otus_fts f
        JOIN otus o ON o.id = f.rowid
        WHERE otus_fts MATCH ? ORDER BY rank LIMIT ?`),
      putSource: q(`INSERT INTO sources (id, cached, author, year, in_project, record) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET cached = excluded.cached, author = excluded.author,
          year = excluded.year, in_project = excluded.in_project, record = excluded.record`),
      getSyncOtu: q('SELECT run, done_at FROM sync_otus WHERE otu_id = ?'),
      putSyncOtu: q(`INSERT INTO sync_otus (otu_id, run, done_at, error) VALUES (?, ?, ?, ?)
        ON CONFLICT(otu_id) DO UPDATE SET run = excluded.run, done_at = excluded.done_at, error = excluded.error`)
    }
  }

  close() {
    this.db.close()
  }

  /**
   * Run `fn` in a transaction. Nested calls join the outer one.
   *
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  transaction(fn) {
    if (this.inTransaction) return fn()

    this.inTransaction = true
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    } finally {
      this.inTransaction = false
    }
  }

  // --- meta ---

  getMeta(key) {
    const row = this.stmt.getMeta.get(key)
    return row ? JSON.parse(row.value) : undefined
  }

  setMeta(key, value) {
    this.stmt.setMeta.run(key, JSON.stringify(value))
  }

  // --- blobs ---

  putBlob(text) {
    const hash = hashText(text)
    this.stmt.putBlob.run(hash, brotliCompressSync(text, BROTLI))
    return hash
  }

  getBlob(hash) {
    const cached = this.blobCache.get(hash)
    if (cached !== undefined) {
      // Refresh recency: Map iteration order is insertion order.
      this.blobCache.delete(hash)
      this.blobCache.set(hash, cached)
      return cached
    }

    const row = this.stmt.getBlob.get(hash)
    if (!row) throw new Error(`Missing blob ${hash}`)

    const text = brotliDecompressSync(row.body).toString('utf8')

    this.blobCache.set(hash, text)
    if (this.blobCache.size > BLOB_CACHE_SIZE) {
      this.blobCache.delete(this.blobCache.keys().next().value)
    }

    return text
  }

  // --- responses ---

  /**
   * @param {string} key - Canonical request key
   * @param {object} response
   * @param {number} response.status
   * @param {object} [response.headers]
   * @param {unknown} [response.data] - Parsed JSON body
   * @param {string} [response.text] - Raw body, for non-JSON responses
   * @param {'sync'|'proxy'} [response.source]
   * @param {number} [response.run]
   */
  putResponse(key, { status, headers = {}, data, text, source = 'sync', run = null }) {
    this.transaction(() => {
      let kind
      let body

      if (text !== undefined) {
        kind = 'text'
        body = brotliCompressSync(text, BROTLI)
      } else {
        kind = 'json'
        const deflated = deflate(data, (blob) => this.putBlob(blob))
        body = brotliCompressSync(JSON.stringify(deflated), BROTLI)
      }

      this.stmt.putResponse.run(
        key,
        status,
        JSON.stringify(headers),
        kind,
        body,
        source,
        run,
        Date.now()
      )
    })
  }

  /**
   * @param {string} key
   * @returns {{ status: number, headers: object, kind: string, data?: unknown, text?: string }|null}
   */
  getResponse(key) {
    const row = this.stmt.getResponse.get(key)
    if (!row) return null

    const raw = row.body ? brotliDecompressSync(row.body).toString('utf8') : ''
    const response = {
      status: row.status,
      headers: JSON.parse(row.headers),
      kind: row.kind
    }

    if (row.kind === 'json') {
      response.data = raw ? inflate(JSON.parse(raw), (hash) => this.getBlob(hash)) : null
    } else {
      response.text = raw
    }

    return response
  }

  /** Keys of the stored JSON responses. */
  jsonResponseKeys() {
    return this.db.prepare("SELECT key FROM responses WHERE kind = 'json'").all().map((row) => row.key)
  }

  /** Whether a successful response is stored for a request. */
  hasResponse(key) {
    return Boolean(this.stmt.hasResponse.get(key))
  }

  /**
   * The run that stored a response: null for one kept by the proxy,
   * undefined when none is stored.
   */
  responseRun(key) {
    const row = this.stmt.getResponseRun.get(key)
    return row ? row.run : undefined
  }

  /** Whether a response was stored during the given sync run. */
  hasResponseFromRun(key, run) {
    return this.stmt.getResponseRun.get(key)?.run === run
  }

  // --- media ---

  getMedia(url) {
    return this.stmt.getMedia.get(url) || null
  }

  getMediaByHash(hash) {
    return this.stmt.getMediaByHash.get(hash) || null
  }

  /** Row counts of the search tables, to tell "empty" from "no match". */
  searchTableSizes() {
    return this.stmt.countTable.get()
  }

  putMedia(url, { hash = null, contentType = null, size = null, status }) {
    this.stmt.putMedia.run(url, hash, contentType, size, status, Date.now())
  }

  /**
   * Remember a file to download.
   *
   * @param {string} key - The key the site requests it by
   * @param {string} url - Where to download it from
   * @param {string} [field] - The response field it was found in
   */
  queueMedia(key, url, field = null) {
    this.queueStatements().queue.run(key, url, field)
  }

  unqueueMedia(key) {
    this.queueStatements().unqueue.run(key)
  }

  /** @returns {Array<{ key: string, url: string, field: string|null }>} */
  queuedMedia() {
    return this.queueStatements().list.all().map(({ key, url, field }) => ({ key, url, field }))
  }

  /**
   * Prepared on first use rather than in prepare(): only the sync writes the
   * queue, and a database opened read-only from an older version has no
   * media_queue table to prepare them against.
   */
  queueStatements() {
    this.queueStmt ??= {
      queue: this.db.prepare('INSERT OR IGNORE INTO media_queue (url, source_url, field) VALUES (?, ?, ?)'),
      unqueue: this.db.prepare('DELETE FROM media_queue WHERE url = ?'),
      list: this.db.prepare('SELECT url AS key, source_url AS url, field FROM media_queue')
    }
    return this.queueStmt
  }

  // --- datasets ---

  /**
   * Record that a stored item belongs to a dataset.
   *
   * @param {string} dataset
   * @param {'response'|'media'} kind
   * @param {string} key
   */
  tagItem(dataset, kind, key) {
    this.datasetStatements().tag.run(dataset, kind, key)
  }

  /**
   * Size of each dataset: its items and their bytes as stored (compressed
   * responses, media files). An item shared by several datasets counts in
   * each, and pieces shared between responses (blobs) in none, so the sizes
   * are a guide rather than a partition of the database.
   *
   * @returns {Record<string, { items: number, bytes: number }>}
   */
  datasetSizes() {
    const sizes = {}
    const add = (dataset, items, bytes) => {
      sizes[dataset] ??= { items: 0, bytes: 0 }
      sizes[dataset].items += items
      sizes[dataset].bytes += bytes
    }

    if (this.hasTable('dataset_items')) {
      const rows = this.db
        .prepare(
          `SELECT d.dataset, COUNT(*) AS items, COALESCE(SUM(LENGTH(r.body)), 0) AS bytes
             FROM dataset_items d JOIN responses r ON r.key = d.key
            WHERE d.kind = 'response' GROUP BY d.dataset
           UNION ALL
           SELECT d.dataset, COUNT(*) AS items, COALESCE(SUM(m.size), 0) AS bytes
             FROM dataset_items d JOIN media m ON m.url = d.key
            WHERE d.kind = 'media' AND m.hash IS NOT NULL GROUP BY d.dataset`
        )
        .all()
      for (const { dataset, items, bytes } of rows) add(dataset, items, bytes)
    }

    // Kept in their own tables rather than as responses.
    const table = (name) => this.db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(record)), 0) AS bytes FROM ${name}`).get()
    const sources = table('sources')
    const news = table('news')
    if (sources.n) add('project:bibliography', sources.n, sources.bytes)
    if (news.n) add('project:news', news.n, news.bytes)

    return sizes
  }

  /**
   * Items recorded only under the given datasets: those no other dataset
   * needs. Items never recorded under any dataset are not included.
   *
   * @param {string[]} datasets
   * @param {'response'|'media'} kind
   * @returns {string[]}
   */
  itemsOnlyIn(datasets, kind) {
    if (!datasets.length || !this.hasTable('dataset_items')) return []

    const marks = datasets.map(() => '?').join(', ')
    return this.db
      .prepare(
        `SELECT key FROM dataset_items WHERE kind = ?
          GROUP BY key HAVING SUM(dataset IN (${marks})) = COUNT(*)`
      )
      .all(kind, ...datasets)
      .map((row) => row.key)
  }

  /** Delete a stored response or file record, and its dataset records. */
  deleteItem(kind, key) {
    const statements = this.datasetStatements()
    if (kind === 'response') statements.deleteResponse.run(key)
    else statements.deleteMedia.run(key)
    statements.untag.run(kind, key)
  }

  /** Empty the bibliography or the news, kept in tables of their own. */
  clearTable(name) {
    if (!['sources', 'news'].includes(name)) throw new Error(`Not a clearable table: ${name}`)
    this.db.exec(`DELETE FROM ${name}`)
  }

  /**
   * Delete the shared pieces no stored response refers to any more, and
   * reclaim the space.
   *
   * @returns {number} Pieces deleted
   */
  collectGarbage() {
    const used = new Set()
    const visit = (value) => {
      for (const hash of blobRefs(value)) {
        if (used.has(hash)) continue
        used.add(hash)
        // A record piece holds deflated JSON, with pieces of its own.
        const row = this.stmt.getBlob.get(hash)
        if (!row) continue
        const text = brotliDecompressSync(row.body).toString('utf8')
        if (text[0] === '{' || text[0] === '[') {
          try {
            visit(JSON.parse(text))
          } catch {
            // a long string that looks like JSON: no pieces inside
          }
        }
      }
    }

    for (const row of this.db.prepare("SELECT body FROM responses WHERE kind = 'json' AND body IS NOT NULL").iterate()) {
      visit(JSON.parse(brotliDecompressSync(row.body).toString('utf8')))
    }

    let deleted = 0
    const remove = this.db.prepare('DELETE FROM blobs WHERE hash = ?')
    this.transaction(() => {
      for (const { hash } of this.db.prepare('SELECT hash FROM blobs').all()) {
        if (!used.has(hash)) {
          remove.run(hash)
          deleted += 1
        }
      }
    })

    this.blobCache.clear()
    this.db.exec('VACUUM')

    return deleted
  }

  /**
   * Prepared on first use, as the media queue's: a database opened read-only
   * from an older version has no dataset_items table.
   */
  datasetStatements() {
    this.datasetStmt ??= {
      tag: this.db.prepare('INSERT OR IGNORE INTO dataset_items (dataset, kind, key) VALUES (?, ?, ?)'),
      untag: this.db.prepare('DELETE FROM dataset_items WHERE kind = ? AND key = ?'),
      deleteResponse: this.db.prepare('DELETE FROM responses WHERE key = ?'),
      deleteMedia: this.db.prepare('DELETE FROM media WHERE url = ?')
    }
    return this.datasetStmt
  }

  mediaPath(hash) {
    return join(this.mediaDir, hash.slice(0, 2), hash)
  }

  // --- search tables ---

  /**
   * @param {object} otu - An `/otus` record (object_tag, taxon_name_id, ...)
   * @param {string} searchText - Plain text to index
   */
  putOtu(otu, searchText) {
    this.transaction(() => {
      this.stmt.putOtu.run(
        otu.id,
        otu.taxon_name_id ?? null,
        otu.object_tag ?? null,
        stripTags(otu.object_tag || otu.name || '').toLowerCase(),
        packJson(otu)
      )
      this.stmt.deleteOtuFts.run(otu.id)
      this.stmt.putOtuFts.run(otu.id, searchText)
    })
  }

  /**
   * @param {string} match - FTS5 MATCH expression
   * @param {number} limit
   */
  searchOtus(match, limit) {
    return this.stmt.searchOtus.all(match, limit).map((row) => ({
      ...unpackJson(row.record),
      label_html: row.label_html
    }))
  }

  /** OTUs in name order, one page. */
  listOtus({ page, per }) {
    const total = this.searchTableSizes().otus
    const records = this.stmt.listOtus.all(per, (page - 1) * per).map((row) => unpackJson(row.record))
    return { total, records }
  }

  putSource(source, { inProject = true } = {}) {
    this.stmt.putSource.run(
      source.id,
      source.cached ?? null,
      source.cached_author_string ?? source.author ?? null,
      Number.parseInt(source.year, 10) || null,
      inProject ? 1 : 0,
      packJson(source)
    )
  }

  /**
   * @param {object} filter
   * @param {string} [filter.term]
   * @param {string} [filter.author]
   * @param {number} [filter.yearStart]
   * @param {number} [filter.yearEnd]
   * @param {boolean} [filter.inProject]
   * @param {number} filter.page
   * @param {number} filter.per
   */
  querySources({ term, author, yearStart, yearEnd, inProject, page, per }) {
    const where = []
    const args = []

    if (term) {
      where.push('cached LIKE ?')
      args.push(`%${term}%`)
    }
    if (author) {
      where.push('author LIKE ?')
      args.push(`%${author}%`)
    }
    if (yearStart) {
      where.push('year >= ?')
      args.push(yearStart)
    }
    if (yearEnd) {
      where.push('year <= ?')
      args.push(yearEnd)
    }
    if (inProject) where.push('in_project = 1')

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM sources ${clause}`).get(...args).n
    const rows = this.db
      .prepare(`SELECT record FROM sources ${clause} ORDER BY cached LIMIT ? OFFSET ?`)
      .all(...args, per, (page - 1) * per)

    return { total, records: rows.map((row) => unpackJson(row.record)) }
  }

  putNews(item) {
    this.stmt.putNews.run(item.id, item.created_at ?? null, packJson(item))
  }

  /**
   * @param {object} filter
   * @param {number[]} [filter.ids]
   * @param {number} filter.page
   * @param {number} filter.per
   */
  queryNews({ ids = [], page, per }) {
    const clause = ids.length ? `WHERE id IN (${ids.map(() => '?').join(', ')})` : ''
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM news ${clause}`).get(...ids).n
    const rows = this.db
      .prepare(`SELECT record FROM news ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...ids, per, (page - 1) * per)

    return { total, records: rows.map((row) => unpackJson(row.record)) }
  }

  // --- sync progress ---

  isOtuDone(otuId, run) {
    const row = this.stmt.getSyncOtu.get(otuId)
    return Boolean(row && row.run === run && row.done_at)
  }

  markOtu(otuId, run, error = null) {
    this.stmt.putSyncOtu.run(otuId, run, error ? null : Date.now(), error)
  }

  // --- reporting ---

  stats() {
    const count = (table, where = '') =>
      this.db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get().n

    const mediaBytes =
      this.db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE hash IS NOT NULL').get().n

    return {
      responses: count('responses'),
      blobs: count('blobs'),
      media: count('media', 'WHERE hash IS NOT NULL'),
      mediaPending: this.hasTable('media_queue') ? count('media_queue') : 0,
      otus: count('otus'),
      sources: count('sources'),
      news: count('news'),
      syncedOtus: count('sync_otus', 'WHERE done_at IS NOT NULL'),
      failedOtus: count('sync_otus', 'WHERE error IS NOT NULL'),
      databaseBytes: fileSize(this.path) + fileSize(`${this.path}-wal`),
      mediaBytes
    }
  }
}

function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
