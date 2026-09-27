/**
 * What the site requests for an OTU page, request for request.
 *
 * Each recipe mirrors the code of a core panel: same path, same params, and
 * the same follow-up requests built from the first response. A stored response
 * is only found again if its request is named exactly as the site names it,
 * so when a panel changes what it sends, its recipe here must change too.
 * Requests the recipes miss are what the miss log is for.
 *
 * `ctx.get(path, params)` performs and stores one request and resolves to the
 * remote response ({ status, data, headers }). It never throws for HTTP
 * errors: a 404 is a legitimate answer the site handles, and is stored too.
 */

/** Rank groups a core panel is limited to, from each panel's main.js. */
const PANEL_RANK_GROUPS = {
  'panel:sounds': ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup'],
  'panel:type': ['FamilyGroup', 'GenusGroup'],
  'panel:type-specimen': ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup'],
  'panel:gallery': []
}

const SPECIES_GROUPS = ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup']

/**
 * The part every OTU page loads before any panel: store.js `loadInit`.
 *
 * @returns {Promise<{ otu: object|null, taxon: object|null }>}
 */
export async function basePage(ctx) {
  const { otuId } = ctx

  const otuResponse = await ctx.get(`/otus/${otuId}`, { extend: ['parents'] })
  const otu = ok(otuResponse) ? otuResponse.data : null
  if (!otu) return { otu: null, taxon: null }

  let taxon = null

  if (otu.taxon_name_id) {
    const id = otu.taxon_name_id
    const [taxonResponse, summary] = await Promise.all([
      ctx.get(`/taxon_names/${id}`),
      ctx.get(`/taxon_names/${id}/inventory/summary`, {
        extend: ['type_taxon_name_relationship']
      })
    ])

    taxon = { ...(ok(taxonResponse) ? taxonResponse.data : {}), ...(ok(summary) ? summary.data : {}) }

    await ctx.get(`/taxon_names/${id}/inventory/catalog`)
  }

  await ctx.get(`/otus/${otuId}/inventory/taxonomy.json`, {
    max_descendants_depth: 0,
    extend: ['common_names']
  })

  return { otu, taxon }
}

/**
 * Descendants panel and tree. Always run, whether or not the panel is shown:
 * it is how a subtree sync discovers the OTUs below this one.
 *
 * @returns {Promise<number[]>} OTU ids of the children
 */
export async function descendants(ctx) {
  const response = await ctx.get(`/otus/${ctx.otuId}/inventory/taxonomy.json`, {
    max_descendants_depth: 1
  })

  if (!ok(response)) return []

  return (response.data.descendants || []).map((d) => d.otu_id).filter(Boolean)
}

/**
 * Panel recipes by panel id. Each receives the localized `bind` objects of
 * every place the panel appears in the layout (one per locale, deduplicated).
 */
export const PANEL_RECIPES = {
  async 'panel:gallery'(ctx, binds) {
    // Server render passes no sort order (it reads props.sortOrder, which is
    // never set); the client passes the configured one. Both are requested.
    const sortOrders = uniqueBy([undefined, ...binds.map((b) => b.sort_order)], JSON.stringify)

    for (const sortOrder of sortOrders) {
      await ctx.get(`/otus/${ctx.otuId}/inventory/images.json`, {
        extend: ['depictions', 'attribution', 'source', 'citations'],
        otu_scope: ['all', 'coordinate_otus'],
        sort_order: sortOrder
      })
    }
  },

  async 'panel:content'(ctx, binds) {
    const paramSets = uniqueBy(binds.map((b) => b.params || {}), JSON.stringify)

    for (const params of paramSets.length ? paramSets : [{}]) {
      await ctx.get(`/otus/${ctx.otuId}/inventory/content`, {
        ...params,
        extend: ['depiction']
      })
    }
  },

  async 'panel:type-specimen'(ctx) {
    await ctx.get(`/otus/${ctx.otuId}/inventory/type_material.json`)
  },

  async 'panel:references-cited'(ctx) {
    await ctx.get(`/otus/${ctx.otuId}/inventory/citations`)
  },

  async 'panel:map'(ctx, binds) {
    const { otuId, rankString } = ctx
    const isSpeciesGroup = SPECIES_GROUPS.some((group) => rankString?.split('::').at(2) === group)
    const withAbsences = binds.length === 0 || binds.some((b) => b.absences !== 'off')

    let needsAggregate = !isSpeciesGroup

    if (isSpeciesGroup) {
      const shapes = await ctx.get(`/otus/${otuId}/inventory/distribution.geojson`)
      // The panel falls back to the aggregate map when the shapes fail.
      if (!ok(shapes)) needsAggregate = true
    }

    if (needsAggregate) {
      const aggregate = await ctx.get(`/otus/${otuId}/inventory/distribution.json`)
      const cachedMapId = ok(aggregate) ? aggregate.data?.cached_map?.id : null
      if (cachedMapId) await ctx.get(`/cached_maps/${cachedMapId}`)
    }

    if (withAbsences) {
      await ctx.get(`/otus/${otuId}/inventory/distribution_is_absent.geojson`)
    }
  },

  async 'panel:keys'(ctx) {
    // PanelKeys builds `{ otu_id }` params, but TaxonWorks.getKeys(otuId)
    // drops its second argument, so the request goes out without them.
    const response = await ctx.get(`/otus/${ctx.otuId}/inventory/keys`)
    if (!ok(response)) return

    const { observation_matrices: matrices = {}, leads = {} } = response.data

    for (const lead of [...(leads.scoped || []), ...(leads.in || [])]) {
      await ctx.once(`lead:${lead.id}`, () => ctx.get(`/leads/key/${lead.id}`))
    }

    // Interactive keys (non-media matrices) are out of scope: they are
    // computed by TaxonWorks for every combination of chosen states.
    for (const matrix of [...(matrices.scoped || []), ...(matrices.in || [])]) {
      if (matrix.is_media) {
        await ctx.once(`matrix:${matrix.id}`, () => imageMatrix(ctx, matrix.id))
      }
    }
  },

  async 'panel:sounds'(ctx) {
    const response = await ctx.get('/sounds', {
      otu_id: ctx.otuId,
      otu_scope: ['field_occurrences', 'otus', 'collection_objects'],
      extend: ['attribution', 'conveyances']
    })

    if (!ok(response)) return

    for (const sound of response.data || []) {
      await ctx.get('/observations', {
        sound_id: sound.id,
        extend: ['character_state', 'depictions', 'image', 'descriptor']
      })
    }
  },

  async 'panel:biological-associations'(ctx, binds) {
    const variants = uniqueBy(
      (binds.length ? binds : [{}]).map((b) => ({
        per: b.per ?? 50,
        images: b.images ?? true,
        assertedDistribution: b.assertedDistribution ?? true,
        citations: b.citations ?? true
      })),
      JSON.stringify
    )

    for (const variant of variants) {
      await biologicalAssociations(ctx, variant)
    }
  }
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
    if (images) {
      await ctx.get('/depictions/gallery', {
        depiction_object_type: ['BiologicalAssociation'],
        depiction_object_id: baIds,
        per: 200
      })
    }

    if (assertedDistribution) {
      await ctx.get('/asserted_distributions', {
        asserted_distribution_object_type: ['BiologicalAssociation'],
        asserted_distribution_object_id: baIds,
        per: 200
      })
    }

    if (citations) {
      for (const id of baIds) {
        await ctx.get('/citations', {
          citation_object_id: id,
          citation_object_type: 'BiologicalAssociation',
          extend: ['source', 'citation_topics']
        })
      }
    }

    const totalPages = Number(response.headers['pagination-total-pages']) || 1
    if (page >= totalPages) return
  }
}

/** ImageMatrix module: every page, without an OTU filter. */
async function imageMatrix(ctx, matrixId) {
  const PER = 50

  for (let page = 1; ; page += 1) {
    const response = await ctx.get(`/observation_matrices/${matrixId}/image_matrix`, {
      otu_filter: undefined,
      page,
      per: PER
    })

    if (!ok(response)) return

    const total = Number(response.data?.pagination?.pagination_total) || 0
    if (page * PER >= total) return
  }
}

/**
 * Panels the layout shows, each with the localized `bind` of every place it
 * appears, and the rank groups it is limited to there.
 *
 * @param {object} layout - `taxa_page` configuration
 * @param {(bind: object) => object[]} localizeBind - One bind per locale
 * @param {Record<string, string[]>} [defaultRankGroups] - Extra panel rank
 *   limits (from packages), on top of the core panels'
 * @returns {Map<string, Array<{ bind: object, rankGroups: string[][] }>>}
 */
export function panelsInLayout(layout, localizeBind, defaultRankGroups = {}) {
  const rankGroupsById = { ...PANEL_RANK_GROUPS, ...defaultRankGroups }

  const panels = new Map()

  for (const tab of Object.values(layout || {})) {
    if (!tab || !Array.isArray(tab.panels)) continue

    const tabRankGroup = Array.isArray(tab.rank_group) ? tab.rank_group : []

    for (const row of tab.panels) {
      for (const column of row || []) {
        for (const ref of column || []) {
          const { id, bind = {}, rank_group } = typeof ref === 'string' ? { id: ref } : ref || {}
          if (!id) continue

          const panelRankGroup = Array.isArray(rank_group) ? rank_group : rankGroupsById[id] || []
          const entries = panels.get(id) || []

          for (const localized of localizeBind(bind)) {
            entries.push({ bind: localized, rankGroups: [tabRankGroup, panelRankGroup] })
          }

          panels.set(id, entries)
        }
      }
    }
  }

  return panels
}

/**
 * Same test as the core's isAvailableForRank, applied to every rank-group
 * list that limits a panel (its tab's and its own).
 */
export function isAvailableForRank(rankGroups, rankString) {
  return rankGroups.every(
    (groups) => !groups.length || groups.some((group) => rankString?.includes(group))
  )
}

function ok(response) {
  return response && response.status >= 200 && response.status < 300
}

function uniqueBy(list, keyOf) {
  const seen = new Map()
  for (const item of list) {
    const key = keyOf(item) ?? 'undefined'
    if (!seen.has(key)) seen.set(key, item)
  }
  return [...seen.values()]
}
