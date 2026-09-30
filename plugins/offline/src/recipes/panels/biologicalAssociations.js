import { ok, uniqueBy } from '../utils.js'

// PanelBiologicalAssociations

const panel = 'panel:biological-associations'

async function otu(ctx, binds) {
  const variants = uniqueBy(
    (binds.length ? binds : [{}]).map((b) => ({
      per: b.per ?? 50,
      images: b.images ?? true,
      assertedDistribution: b.assertedDistribution ?? true,
      citations: b.citations ?? true
    })),
    JSON.stringify
  )

  await Promise.all(variants.map((variant) => biologicalAssociations(ctx, variant)))
}

async function biologicalAssociations(ctx, { per, images, assertedDistribution, citations }) {
  for (let page = 1; ; page += 1) {
    const response = await ctx.get('/biological_associations/basic', {
      'otu_query[coordinatify]': true,
      'otu_query[otu_id][]': ctx.otuId,
      per,
      page,
      extend: ['object', 'subject', 'biological_relationship', 'taxonomy', 'biological_relationship_types']
    })

    if (!ok(response)) return

    const baIds = (response.data || []).map((ba) => ba.id)

    // The panel sends these even for an empty page, so they are mirrored.
    await Promise.all([
      images
        ? ctx.get('/depictions/gallery', {
            depiction_object_type: ['BiologicalAssociation'],
            depiction_object_id: baIds,
            per: 200
          })
        : null,
      assertedDistribution
        ? ctx.get('/asserted_distributions', {
            asserted_distribution_object_type: ['BiologicalAssociation'],
            asserted_distribution_object_id: baIds,
            per: 200
          })
        : null,
      ...(citations
        ? baIds.map((id) =>
            ctx.get('/citations', {
              citation_object_id: id,
              citation_object_type: 'BiologicalAssociation',
              extend: ['source', 'citation_topics']
            })
          )
        : [])
    ])

    const totalPages = Number(response.headers['pagination-total-pages']) || 1
    if (page >= totalPages) return
  }
}

export default { panel, hooks: { otu } }
