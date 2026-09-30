import { pageOf, pageSize, paginationHeaders } from '../../server/query.js'

// The news module: its list (/news) and each news page (/news/:id). The list
// is kept in the news table and answered from it, filtered and paged as the
// site asks.

const module = 'news'

const datasets = [
  { id: 'project:news', group: 'project', label: 'News', description: 'The news list and each news page.' }
]

async function project(ctx, { store, missing, list }) {
  if (!ctx.includes('project:news')) return

  const ids = []

  // A listing is not a request the store answers by key: when fetching only
  // what is missing, news already stored are not listed again.
  if (!(missing && store.searchTableSizes().news)) {
    await list('/news', {}, (records) =>
      store.transaction(() =>
        records.forEach((item) => {
          store.putNews(item)
          ids.push(item.id)
        })
      )
    )
  }

  await Promise.all(ids.map((id) => ctx.get(`/news/${id}`)))
}

const serve = {
  /** Current as of the sync. Null while there are none, to fall through. */
  news(query, store) {
    if (!store.searchTableSizes().news) return null

    const page = pageOf(query)
    const per = pageSize(query)
    const ids = [...query.getAll('news_id'), ...query.getAll('news_id[]')]
      .map(Number)
      .filter(Number.isInteger)

    const { total, records } = store.queryNews({ ids, page, per })

    return { status: 200, headers: paginationHeaders({ page, per, total }), data: records }
  }
}

export default { module, datasets, hooks: { project }, serve }
