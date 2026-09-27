/**
 * Endpoints that take free-text queries and so cannot be answered from stored
 * responses. They are answered from the search tables instead.
 *
 * Results follow TaxonWorks' shape but not its ranking: the autocomplete ranks
 * by SQLite FTS relevance, not by TaxonWorks' exact/prefix/fuzzy tiers.
 *
 * A handler returns null when its table is empty, so the request falls through
 * to stored responses or the proxy instead of answering with nothing.
 */

import { stripTags } from '../text.js'

const AUTOCOMPLETE_LIMIT = 25

/** TaxonWorks' page size when a request gives none (kaminari default). */
const DEFAULT_PER = 50

/**
 * @param {string} path - Normalized API path
 * @param {URLSearchParams} query
 * @param {import('../store.js').OfflineStore} store
 * @returns {{ status: number, headers?: object, data: unknown }|null}
 */
export function answerSearch(path, query, store) {
  const handler = HANDLERS[path]
  return handler ? handler(query, store) : null
}

const HANDLERS = {
  'otus/autocomplete': otuAutocomplete,
  sources: sourcesIndex,
  news: newsIndex,
  'otus/inventory/alphabetical': otusAlphabetical
}

function otuAutocomplete(query, store) {
  if (!store.searchTableSizes().otus) return null

  const term = (query.get('term') || '').trim()
  const match = toFtsQuery(term)

  if (!match) return { status: 200, data: [] }

  const onlyWithName =
    isTrue(query.get('having_taxon_name_only')) || isTrue(query.get('with_taxon_name'))

  const results = store
    .searchOtus(match, AUTOCOMPLETE_LIMIT * 2)
    .filter((otu) => !onlyWithName || otu.taxon_name_id)
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map((otu) => ({
      id: otu.id,
      gid: otu.global_id,
      otu_valid_id: otu.id,
      label: stripTags(otu.label_html || otu.name || ''),
      label_html: otu.label_html || otu.name || ''
    }))

  return { status: 200, data: results }
}

function sourcesIndex(query, store) {
  if (!store.searchTableSizes().sources) return null

  const page = Math.max(1, Number.parseInt(query.get('page'), 10) || 1)
  const per = pageSize(query)

  const { total, records } = store.querySources({
    term: (query.get('query_term') || '').trim(),
    author: (query.get('author') || '').trim(),
    yearStart: Number.parseInt(query.get('year_start'), 10) || null,
    yearEnd: Number.parseInt(query.get('year_end'), 10) || null,
    inProject: isTrue(query.get('in_project')),
    page,
    per
  })

  return { status: 200, headers: paginationHeaders({ page, per, total }), data: records }
}

/**
 * The DwC filter's OTU list. Without filters it is every OTU in name order,
 * which the OTU table can answer. Filtering by occurrence data needs the
 * occurrences themselves, which are not synced: those requests fall through
 * to the proxy, or to a recorded miss.
 */
function otusAlphabetical(query, store) {
  if (!store.searchTableSizes().otus) return null
  if ([...query.keys()].some((key) => key.startsWith('dwc_occurrence_query'))) return null

  const page = Math.max(1, Number.parseInt(query.get('page'), 10) || 1)
  const per = pageSize(query)
  const { total, records } = store.listOtus({ page, per })

  return { status: 200, headers: paginationHeaders({ page, per, total }), data: records }
}

function newsIndex(query, store) {
  if (!store.searchTableSizes().news) return null

  const page = Math.max(1, Number.parseInt(query.get('page'), 10) || 1)
  const per = pageSize(query)
  const ids = [...query.getAll('news_id'), ...query.getAll('news_id[]')]
    .map(Number)
    .filter(Number.isInteger)

  const { total, records } = store.queryNews({ ids, page, per })

  return { status: 200, headers: paginationHeaders({ page, per, total }), data: records }
}

function pageSize(query) {
  return Math.max(1, Number.parseInt(query.get('per'), 10) || DEFAULT_PER)
}

/**
 * Headers in the shape TaxonWorks (kaminari) sends and the site reads.
 */
export function paginationHeaders({ page, per, total }) {
  const totalPages = Math.max(1, Math.ceil(total / per))
  const headers = {
    'pagination-page': String(page),
    'pagination-per-page': String(per),
    'pagination-total': String(total),
    'pagination-total-pages': String(totalPages)
  }

  if (page < totalPages) headers['pagination-next-page'] = String(page + 1)
  if (page > 1) headers['pagination-previous-page'] = String(page - 1)

  return headers
}

/**
 * Turn what someone typed into an FTS5 prefix query: every word must appear,
 * the last may be unfinished. Quotes are doubled so input can never inject
 * FTS syntax.
 *
 * @param {string} term
 */
export function toFtsQuery(term) {
  const words = term
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)

  return words.join(' ')
}

function isTrue(value) {
  return value === 'true' || value === '1'
}
