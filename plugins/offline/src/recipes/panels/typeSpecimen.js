// PanelTypeSpecimen

const panel = 'panel:type-specimen'
const rankGroup = ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup']

async function otu(ctx) {
  await ctx.get(`/otus/${ctx.otuId}/inventory/type_material.json`)
}

export default { panel, rankGroup, hooks: { otu } }
