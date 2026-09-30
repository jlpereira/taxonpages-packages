import { pageOf, pageSize, paginationHeaders } from '../../server/query.js'

// The DwC filter module. Its OTU list without filters is every OTU in name
// order, which the OTU index answers. Filtering needs the occurrences
// themselves, which are not synced.

const module = 'dwc-filter'

const unavailable = [
  {
    match: /^otus\/inventory\/alphabetical\?.*dwc_occurrence_query/,
    reason: 'The DwC filter with a filter set: TaxonWorks filters the occurrences.'
  },
  { match: /^dwc_occurrences/, reason: 'DwC occurrences and their downloads, from the DwC filter.' }
]

const serve = {
  'otus/inventory/alphabetical'(query, store) {
    if (!store.searchTableSizes().otus) return null
    if ([...query.keys()].some((key) => key.startsWith('dwc_occurrence_query'))) return null

    const page = pageOf(query)
    const per = pageSize(query)
    const { total, records } = store.listOtus({ page, per })

    return { status: 200, headers: paginationHeaders({ page, per, total }), data: records }
  }
}

export default { module, serve, unavailable }
