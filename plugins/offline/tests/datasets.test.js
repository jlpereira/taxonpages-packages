import { describe, it, expect } from 'vitest'
import { resolveDatasets } from '../src/datasets.js'
import { CORE_RECIPES } from '../src/recipes/index.js'
import { MEDIA_FIELDS } from '../src/media.js'

// What the core's panels, modules and components declare.
const coreDatasets = CORE_RECIPES.flatMap((recipe) => recipe.datasets || [])

const ids = (datasets) => datasets.list.filter((d) => d.included).map((d) => d.id)

describe('resolveDatasets', () => {
  it('includes everything but the map point details by default', () => {
    const datasets = resolveDatasets({ panels: ['panel:map', 'panel:gallery'], recipeDatasets: coreDatasets })

    expect(datasets.includes('panel:map')).toBe(true)
    expect(datasets.includes('project:bibliography')).toBe(true)
    expect(datasets.includes('media:original_png')).toBe(true)
    expect(datasets.includes('map:dwc')).toBe(false)
  })

  it('has the datasets of the core modules and components', () => {
    const datasets = resolveDatasets({ recipeDatasets: coreDatasets })
    for (const id of ['project:bibliography', 'project:news', 'project:stats']) {
      expect(datasets.list.find((d) => d.id === id)).toMatchObject({ group: 'project', included: true })
    }
  })

  it('has a dataset for every media field', () => {
    const datasets = resolveDatasets({})
    for (const field of MEDIA_FIELDS) {
      expect(datasets.list.some((d) => d.id === `media:${field}`)).toBe(true)
    }
  })

  it('follows offline.include, but never leaves out the pages', () => {
    const datasets = resolveDatasets({
      panels: ['panel:map'],
      recipeDatasets: coreDatasets,
      include: { 'map:dwc': true, 'panel:map': false, 'project:news': false, page: false }
    })

    expect(datasets.includes('map:dwc')).toBe(true)
    expect(datasets.includes('panel:map')).toBe(false)
    expect(datasets.includes('project:news')).toBe(false)
    expect(datasets.includes('page')).toBe(true)
  })

  it('leaves every media dataset out when media is off', () => {
    const datasets = resolveDatasets({ media: false, include: { 'media:thumb': true } })
    expect(ids(datasets).filter((id) => id.startsWith('media:'))).toEqual([])
  })

  it('adds the datasets of packages, and includes undeclared ones unless named', () => {
    const datasets = resolveDatasets({
      recipeDatasets: [
        ...coreDatasets,
        { id: 'ety:citations', label: 'Etymology citations', default: false, source: 'PanelEty' }
      ],
      include: { 'other:thing': false }
    })

    expect(datasets.list.find((d) => d.id === 'ety:citations')).toMatchObject({ group: 'packages', included: false })
    // A core recipe's dataset keeps the group it names.
    expect(datasets.list.find((d) => d.id === 'map:dwc')).toMatchObject({ group: 'map', included: false })
    expect(datasets.includes('undeclared')).toBe(true)
    expect(datasets.includes('other:thing')).toBe(false)
  })
})
