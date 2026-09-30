/**
 * Helpers for the recipes that answer queries (`serve`): reading the
 * parameters of a request the way TaxonWorks does, and answering in its shape.
 */

/** TaxonWorks' page size when a request gives none (kaminari default). */
export const DEFAULT_PER = 50

/** The requested page, 1 when none or not a number. */
export function pageOf(query) {
  return Math.max(1, Number.parseInt(query.get('page'), 10) || 1)
}

/** The requested page size, TaxonWorks' default when none. */
export function pageSize(query) {
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

export function isTrue(value) {
  return value === 'true' || value === '1'
}
