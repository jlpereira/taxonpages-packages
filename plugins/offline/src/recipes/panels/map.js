import { ok } from '../utils.js'

// PanelMap, and the Darwin Core table (DwcTable.vue) its points open

const panel = 'panel:map'

const datasets = [
  {
    id: 'map:dwc',
    group: 'map',
    label: 'Map point details',
    description:
      'The Darwin Core table of each specimen and field occurrence on the map, and the images it lists. One request per point.',
    default: false
  }
]

const unavailable = [
  {
    match: /^(collection_objects|field_occurrences)\/\d+\/dwc/,
    reason: 'Map point details: include the map:dwc dataset to sync them.'
  },
  { match: /^otus\?.*(geo_json|wkt|geo_shape)/, reason: 'The area search of the map: TaxonWorks searches the area.' }
]

const SPECIES_GROUPS = ['SpeciesGroup', 'SpeciesAndInfraspeciesGroup']

/** The table of the map points of each type. */
const DWC_PATHS = {
  CollectionObject: (id) => `/collection_objects/${id}/dwc`,
  FieldOccurrence: (id) => `/field_occurrences/${id}/dwc`
}

async function otu(ctx, binds) {
  const { otuId, rankString } = ctx
  const isSpeciesGroup = SPECIES_GROUPS.some((group) => rankString?.split('::').at(2) === group)
  const withAbsences = binds.length === 0 || binds.some((b) => b.absences !== 'off')

  /** @returns {Promise<object|null>} The shapes, when the map shows them */
  async function presences() {
    let needsAggregate = !isSpeciesGroup
    let shapes = null

    if (isSpeciesGroup) {
      shapes = await ctx.get(`/otus/${otuId}/inventory/distribution.geojson`)
      // The panel falls back to the aggregate map when the shapes fail.
      if (!ok(shapes)) needsAggregate = true
    }

    if (needsAggregate) {
      const aggregate = await ctx.get(`/otus/${otuId}/inventory/distribution.json`)
      const cachedMapId = ok(aggregate) ? aggregate.data?.cached_map?.id : null
      if (cachedMapId) await ctx.get(`/cached_maps/${cachedMapId}`)
    }

    return ok(shapes) ? shapes.data : null
  }

  const [shapes, absences] = await Promise.all([
    presences(),
    withAbsences ? ctx.get(`/otus/${otuId}/inventory/distribution_is_absent.geojson`) : null
  ])

  if (ctx.includes('map:dwc')) {
    await pointDetails({ ...ctx, ...ctx.forDataset('map:dwc') }, [shapes, ok(absences) ? absences.data : null])
  }
}

/**
 * What the map shows when a point is clicked: the Darwin Core table of each
 * specimen and field occurrence among the features, and the images its
 * `associatedMedia` lists. Once per point, whatever OTU maps it.
 *
 * @param {object} ctx
 * @param {Array<object|null>} collections - GeoJSON feature collections
 */
async function pointDetails(ctx, collections) {
  const points = new Map()

  for (const collection of collections) {
    for (const feature of collection?.features || []) {
      for (const base of [feature?.properties?.base].flat()) {
        if (base?.id && DWC_PATHS[base.type]) points.set(`${base.type}:${base.id}`, base)
      }
    }
  }

  await Promise.all(
    [...points].map(([id, { type, id: objectId }]) =>
      ctx.once(`dwc:${id}`, async () => {
        const response = await ctx.get(DWC_PATHS[type](objectId))
        if (ok(response)) await associatedMedia(ctx, response.data)
      })
    )
  )
}

/**
 * The images a Darwin Core record lists in `associatedMedia`, requested as
 * DwcCategories.js requests them: each link as it is, with the image's
 * attribution, depictions and source.
 *
 * @param {object} ctx
 * @param {object} record
 */
async function associatedMedia(ctx, record) {
  const links = String(record?.associatedMedia || '')
    .split('|')
    .map((link) => link.trim())
    .filter((link) => ctx.isApiUrl(link))

  await Promise.all(
    links.map((link) => ctx.get(link, { extend: ['attribution', 'depictions', 'source'] }))
  )
}

export default { panel, datasets, hooks: { otu }, unavailable }
