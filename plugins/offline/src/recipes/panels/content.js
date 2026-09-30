import { uniqueBy } from '../utils.js'

// PanelContent

const panel = 'panel:content'

async function otu(ctx, binds) {
  const paramSets = uniqueBy(binds.map((b) => b.params || {}), JSON.stringify)

  await Promise.all(
    (paramSets.length ? paramSets : [{}]).map((params) =>
      ctx.get(`/otus/${ctx.otuId}/inventory/content`, {
        ...params,
        extend: ['depiction']
      })
    )
  )
}

export default { panel, hooks: { otu } }
