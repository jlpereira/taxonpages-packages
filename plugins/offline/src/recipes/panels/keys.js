import { ok } from '../utils.js'
import { key } from '../modules/keys.js'
import { matrix } from '../modules/imageMatrix.js'

// PanelKeys: the keys of the OTU, and what the modules they open load

const panel = 'panel:keys'

async function otu(ctx) {
  // PanelKeys builds `{ otu_id }` params, but TaxonWorks.getKeys(otuId)
  // drops its second argument, so the request goes out without them.
  const response = await ctx.get(`/otus/${ctx.otuId}/inventory/keys`)
  if (!ok(response)) return

  const { observation_matrices: matrices = {}, leads = {} } = response.data

  // Interactive keys (non-media matrices) are out of scope: they are
  // computed by TaxonWorks for every combination of chosen states.
  await Promise.all([
    ...[...(leads.scoped || []), ...(leads.in || [])].map((lead) =>
      ctx.once(`lead:${lead.id}`, () => key(ctx, lead.id))
    ),
    ...[...(matrices.scoped || []), ...(matrices.in || [])]
      .filter((item) => item.is_media)
      .map(({ id }) => ctx.once(`matrix:${id}`, () => matrix(ctx, id)))
  ])
}

export default { panel, hooks: { otu } }
