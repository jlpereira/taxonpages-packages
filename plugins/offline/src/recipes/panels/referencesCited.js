// PanelReferences

const panel = 'panel:references-cited'

async function otu(ctx) {
  await ctx.get(`/otus/${ctx.otuId}/inventory/citations`)
}

export default { panel, hooks: { otu } }
