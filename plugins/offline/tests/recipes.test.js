import { describe, it, expect } from 'vitest'
import { CORE_RECIPES, serve, unavailableReason, withCoreRecipes } from '../src/recipes/index.js'
import { canonicalKey, serializeParams } from '../src/params.js'
import { normalizeRecipe } from '../src/sync/recipeShape.js'
import { tempStore } from './helpers.js'

const emptyPackages = { panels: new Map(), everyOtu: [], project: [], datasets: [] }

describe('core recipes', () => {
  it('have the shape of a package recipe, plus what only the core says', () => {
    const warnings = []
    for (const recipe of CORE_RECIPES) {
      const source = recipe.panel || recipe.module || recipe.component
      normalizeRecipe(recipe, { source, core: true, warn: (message) => warnings.push(message) })
    }
    expect(warnings).toEqual([])
  })

  it('say what they are, and panels how they fetch', () => {
    for (const recipe of CORE_RECIPES) {
      const kinds = ['panel', 'module', 'component'].filter((kind) => recipe[kind])
      expect(kinds).toHaveLength(1)
      if (recipe.panel) expect(typeof recipe.hooks?.otu).toBe('function')
    }
  })

  it('combine with packages, a package winning for the same panel', () => {
    const own = { source: 'PanelMap', recipe: async () => {}, rankGroup: ['SpeciesGroup'] }
    const recipes = withCoreRecipes({ ...emptyPackages, panels: new Map([['panel:map', own]]) })

    expect(recipes.panels.get('panel:map')).toBe(own)
    expect(recipes.panels.get('panel:gallery').source).toBe('core')
    // Project recipes of the core, recorded under their dataset.
    expect(recipes.project.map((entry) => entry.dataset).sort()).toEqual([
      'project:bibliography',
      'project:news',
      'project:stats'
    ])
  })
})

describe('serve', () => {
  it('answers the endpoints recipes serve, from their tables', () => {
    const store = tempStore()
    store.putNews({ id: 1, created_at: '2024-01-01' })
    store.putNews({ id: 2, created_at: '2025-01-01' })

    const answer = serve('news', new URLSearchParams('per=1'), store)

    expect(answer.data.map((item) => item.id)).toEqual([2])
    expect(answer.headers['pagination-total']).toBe('2')
  })

  it('falls through when nothing serves the path, or its table is empty', () => {
    const store = tempStore()
    expect(serve('otus/1', new URLSearchParams(), store)).toBeNull()
    expect(serve('sources', new URLSearchParams(), store)).toBeNull()
  })
})

describe('unavailableReason', () => {
  it('explains requests that cannot be synced, from keys as the log records them', () => {
    const areaSearch = canonicalKey('/otus', serializeParams({ geo_json: '{}', per: 50 }))

    expect(unavailableReason('observation_matrices/3/key?row_filter=1')).toMatch(/Interactive keys/)
    expect(unavailableReason(areaSearch)).toMatch(/area search/)
    expect(unavailableReason('collection_objects/5/dwc')).toMatch(/map:dwc/)
    expect(unavailableReason('otus/5')).toBeNull()
  })
})
