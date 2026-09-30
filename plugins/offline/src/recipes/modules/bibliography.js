import { isTrue, pageOf, pageSize, paginationHeaders } from '../../server/query.js'

// The bibliography module: the project's sources, kept in the sources table
// and searched there with the filters the module sends.

const module = 'bibliography'

const datasets = [
  {
    id: 'project:bibliography',
    group: 'project',
    label: 'Bibliography',
    description: "The project's sources, for the bibliography page."
  }
]

const unavailable = [
  {
    match: /^otus\?.*source_query/,
    reason: 'The OTUs of a source (bibliography): TaxonWorks searches them for each source.'
  }
]

async function project(ctx, { store, missing, list }) {
  if (!ctx.includes('project:bibliography')) return
  if (missing && store.searchTableSizes().sources) return

  await list('/sources', { in_project: true }, (records) =>
    store.transaction(() => records.forEach((source) => store.putSource(source)))
  )
}

const serve = {
  /** Same filters; `query_term` and `author` match substrings. */
  sources(query, store) {
    if (!store.searchTableSizes().sources) return null

    const page = pageOf(query)
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
}

export default { module, datasets, hooks: { project }, serve, unavailable }
