import { ok } from '../utils.js'

// PanelSounds

const panel = 'panel:sounds'
const rankGroup = ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup']

async function otu(ctx) {
  const response = await ctx.get('/sounds', {
    otu_id: ctx.otuId,
    otu_scope: ['field_occurrences', 'otus', 'collection_objects'],
    extend: ['attribution', 'conveyances']
  })

  if (!ok(response)) return

  await Promise.all(
    (response.data || []).map((sound) =>
      ctx.get('/observations', {
        sound_id: sound.id,
        extend: ['character_state', 'depictions', 'image', 'descriptor']
      })
    )
  )
}

export default { panel, rankGroup, hooks: { otu } }
