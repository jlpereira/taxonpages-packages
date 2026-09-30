import { MEDIA_FIELDS } from './media.js'

/**
 * What a sync stores, as datasets that can each be left out
 * (`offline.include`).
 *
 * Each OTU page panel of the layout is a dataset, named by its panel id. The
 * core adds the ones below, and recipes their own in their `datasets`:
 * those of core panels, modules and components (the map's point details, the
 * bibliography, the news) as those of packages. Recipes ask
 * `ctx.includes(id)` before fetching something optional, and every request
 * and file is recorded under the dataset that asked for it, to measure and
 * prune them.
 *
 * `required` datasets cannot be left out: without them there is no page.
 */
export const CORE_DATASETS = [
  {
    id: 'page',
    group: 'core',
    label: 'OTU pages',
    description: 'The OTU, its taxon name, catalog, summary and taxonomy: what every page loads.',
    required: true
  }
]

/** Media datasets, one per field media are found in (see media.js). */
const MEDIA_DATASETS = {
  thumb: { label: 'Thumbnails', description: 'Galleries, tables and keys.' },
  original_png: { label: 'Full-size images', description: 'The gallery and the image viewer. Most of the media.' },
  original: { label: 'Original images', description: 'The carousel, dichotomous keys and map point details.' },
  image: { label: 'Key figures', description: 'Figures of keys without an original image.' },
  sound_file: { label: 'Sounds', description: 'Recordings of the sounds panel.' }
}

export const mediaDataset = (field) => `media:${field}`

/**
 * The datasets of a sync and which of them are included.
 *
 * @param {object} options
 * @param {Iterable<string>} options.panels - Panel ids the layout shows
 * @param {Array<{ id: string, group?: string, label?: string, description?: string, default?: boolean, source?: string }>} [options.recipeDatasets] -
 *   Declared by recipes; a package's are in the `packages` group unless they
 *   name one
 * @param {Record<string, boolean>} [options.include] - `offline.include`
 * @param {boolean} [options.media] - `offline.media`: false leaves every
 *   media dataset out
 * @returns {Datasets}
 */
export function resolveDatasets({ panels = [], recipeDatasets = [], include = {}, media = true }) {
  const candidates = [
    ...CORE_DATASETS,
    ...[...panels].map((id) => ({
      id,
      group: 'panels',
      label: id,
      description: 'What the panel requests on each OTU page.'
    })),
    ...[...MEDIA_FIELDS].map((field) => ({ id: mediaDataset(field), group: 'media', ...MEDIA_DATASETS[field] })),
    ...recipeDatasets.map((dataset) => ({ group: 'packages', ...dataset }))
  ]

  const byId = new Map()
  for (const dataset of candidates) {
    if (!dataset?.id || byId.has(dataset.id)) continue

    const off = dataset.group === 'media' && media === false
    const included = dataset.required || (!off && (include[dataset.id] ?? dataset.default ?? true))

    byId.set(dataset.id, { label: dataset.id, description: '', ...dataset, default: dataset.default ?? true, included })
  }

  return {
    list: [...byId.values()],

    /**
     * Whether a dataset is included. One nobody declared is included unless
     * the configuration leaves it out by name.
     */
    includes(id) {
      return byId.get(id)?.included ?? include[id] ?? true
    }
  }
}

/**
 * @typedef {object} Datasets
 * @property {Array<{ id: string, group: string, label: string, description: string, default: boolean, required?: boolean, included: boolean, source?: string }>} list
 * @property {(id: string) => boolean} includes
 */
