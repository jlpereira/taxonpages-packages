import { ok } from '../utils.js'
import { stripTags } from '../../text.js'
import { toFtsQuery, isTrue } from '../../server/query.js'

// The otus module: what every OTU page loads before its panels, and the OTU
// search (AutocompleteOtu.global.vue, the search of the otus module). The
// sync fills the OTU index as it syncs each page, or with the whole project
// listed at once.

const module = 'otus'

const AUTOCOMPLETE_LIMIT = 25

/**
 * The part every OTU page loads before any panel: store.js `loadInit`.
 *
 * @returns {Promise<{ otu: object|null, taxon: object|null }>}
 */
export async function basePage(ctx) {
  const { otuId } = ctx

  const otuResponse = await ctx.get(`/otus/${otuId}`, { extend: ['parents'] })
  const otu = ok(otuResponse) ? otuResponse.data : null
  if (!otu) return { otu: null, taxon: null }

  const id = otu.taxon_name_id

  // All of them depend on the OTU only.
  const [taxonResponse, summary] = await Promise.all([
    id ? ctx.get(`/taxon_names/${id}`) : null,
    id ? ctx.get(`/taxon_names/${id}/inventory/summary`, { extend: ['type_taxon_name_relationship'] }) : null,
    id ? ctx.get(`/taxon_names/${id}/inventory/catalog`) : null,
    ctx.get(`/otus/${otuId}/inventory/taxonomy.json`, {
      max_descendants_depth: 0,
      extend: ['common_names']
    })
  ])

  const taxon = id
    ? { ...(ok(taxonResponse) ? taxonResponse.data : {}), ...(ok(summary) ? summary.data : {}) }
    : null

  return { otu, taxon }
}

/**
 * Descendants panel and tree. Always run, whether or not the panel is shown:
 * it is how a subtree sync discovers the OTUs below this one.
 *
 * @returns {Promise<number[]>} OTU ids of the children
 */
export async function descendants(ctx) {
  const response = await ctx.get(`/otus/${ctx.otuId}/inventory/taxonomy.json`, {
    max_descendants_depth: 1
  })

  if (!ok(response)) return []

  return (response.data.descendants || []).map((d) => d.otu_id).filter(Boolean)
}

const serve = {
  /**
   * Ranked by SQLite FTS relevance, not TaxonWorks' exact/prefix/fuzzy tiers.
   * Null while the index is empty, so the request falls through to stored
   * responses or the proxy instead of answering with nothing.
   */
  'otus/autocomplete'(query, store) {
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
}

export default { module, serve }
