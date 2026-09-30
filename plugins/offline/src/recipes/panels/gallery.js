import { uniqueBy } from '../utils.js'

// PanelGallery

const panel = 'panel:gallery'
const rankGroup = []

async function otu(ctx, binds) {
  // Server render passes no sort order (it reads props.sortOrder, which is
  // never set); the client passes the configured one. Both are requested.
  const sortOrders = uniqueBy([undefined, ...binds.map((b) => b.sort_order)], JSON.stringify)

  await Promise.all(
    sortOrders.map((sortOrder) =>
      ctx.get(`/otus/${ctx.otuId}/inventory/images.json`, {
        extend: ['depictions', 'attribution', 'source', 'citations'],
        otu_scope: ['all', 'coordinate_otus'],
        sort_order: sortOrder
      })
    )
  )
}

export default { panel, rankGroup, hooks: { otu } }
