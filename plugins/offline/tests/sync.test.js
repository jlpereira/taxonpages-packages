import { describe, it, expect } from 'vitest'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { runSync } from '../src/sync/sync.js'
import { panelsInLayout, isAvailableForRank } from '../src/sync/recipes.js'
import { RemoteClient } from '../src/remote.js'
import { resolveOfflineConfig } from '../src/config.js'
import { tempStore, tempDir, fakeFetch, writeFiles } from './helpers.js'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('@sfgrp/taxonpages/package.json'))

const SOURCE = 'https://tw.example.org/api/v1'
const GENUS = 'NomenclaturalRank::Iczn::GenusGroup::Genus'
const SPECIES = 'NomenclaturalRank::Iczn::SpeciesGroup::Species'

const configuration = {
  url: SOURCE,
  project_token: 't',
  i18n: { locales: ['en', 'es'] },
  taxa_page: {
    overview: {
      panels: [
        [
          [
            { id: 'panel:gallery', bind: { sort_order: ['Otu'] } },
            'panel:type-specimen',
            {
              id: 'panel:content',
              bind: { en: { params: { topic_id: [1] } }, es: { params: { topic_id: [2] } } }
            },
            'panel:map'
          ]
        ]
      ]
    }
  }
}

/**
 * A tiny project: genus OTU 1 with species 2 and 3. Every other request
 * answers an empty object, or an empty page for indexes.
 */
function tree(key) {
  const otu = key.match(/^otus\/(\d+)\?extend\[\]=parents$/)
  if (otu) {
    const id = Number(otu[1])
    const parents = id === 9 ? {} : id === 1 ? { Root: [{ id: 9 }] } : { Root: [{ id: 9 }], Aus: [{ id: 1 }] }
    return { data: { id, taxon_name_id: id * 10, global_id: `gid://Otu/${id}`, object_tag: `Taxon ${id}`, parents } }
  }

  const name = key.match(/^taxon_names\/(\d+)$/)
  if (name) return { data: { id: Number(name[1]), rank_string: name[1] === '10' ? GENUS : SPECIES } }

  if (key === 'otus/1/inventory/taxonomy.json?max_descendants_depth=1') {
    return { data: { descendants: [{ otu_id: 2 }, { otu_id: 3 }] } }
  }

  if (key === 'otus/1/inventory/distribution.json') {
    return { data: { cached_map: { id: 77, geo_json: '{}' } } }
  }

  // OTUs recorded in geographic area 5: species 2 only.
  if (key.startsWith('otus?geo_shape_id')) {
    return { data: [{ id: 2, taxon_name_id: 20, object_tag: 'Taxon 2' }], headers: { 'pagination-total-pages': '1' } }
  }

  if (/^(sources|news|otus)\?/.test(key)) {
    return { data: [], headers: { 'pagination-total-pages': '1' } }
  }

  return { data: {} }
}

async function sync(store, fetch, { roots = [1], fresh = false, signal, projectRoot = tempDir(), site = configuration, offline = {} } = {}) {
  const config = { ...resolveOfflineConfig({ ...site, offline: { roots, media: false, ...offline } }, '/tmp') }
  const remote = new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 10000, retries: 0, fetch })

  return runSync({
    config,
    store,
    remote,
    configuration: site,
    packageRoot,
    projectRoot,
    fresh,
    signal,
    logger: { info() {}, warn() {}, error() {} }
  })
}

describe('runSync', () => {
  it('walks a subtree and requests what each page shows', async () => {
    const store = tempStore()
    const { fetch, calls } = fakeFetch(tree)

    const result = await sync(store, fetch)

    expect(result).toMatchObject({ phase: 'completed', done: 3, failed: 0, queued: 3 })

    // Genus: aggregate map and its cached map; no type specimens.
    expect(calls).toContain('otus/1/inventory/distribution.json')
    expect(calls).toContain('cached_maps/77')
    expect(calls).not.toContain('otus/1/inventory/type_material.json')

    // Species: shapes and type specimens.
    expect(calls).toContain('otus/2/inventory/distribution.geojson')
    expect(calls).toContain('otus/3/inventory/type_material.json')

    // Gallery: once as the server renders it, once as the browser does.
    expect(calls.filter((c) => c.startsWith('otus/2/inventory/images.json'))).toHaveLength(2)

    // Content: one request per locale's topics.
    expect(calls).toContain('otus/2/inventory/content?topic_id[]=1&extend[]=depiction')
    expect(calls).toContain('otus/2/inventory/content?topic_id[]=2&extend[]=depiction')

    // Stored under the key the site will ask for.
    expect(store.getResponse('otus/1/inventory/taxonomy?max_descendants_depth=1').data.descendants).toHaveLength(2)
    expect(store.searchOtus('"taxon"*', 10)).toHaveLength(3)
  })

  it('resumes an interrupted run without fetching again', async () => {
    const store = tempStore()
    const first = fakeFetch(tree)
    const controller = new AbortController()

    // Stop as soon as the first OTU page is done.
    const interrupted = await sync(store, (url, init) => {
      if (url.includes('otus/2')) controller.abort()
      return first.fetch(url, init)
    }, { signal: controller.signal })

    expect(interrupted.phase).toBe('interrupted')

    const second = fakeFetch(tree)
    const resumed = await sync(store, second.fetch)

    expect(resumed).toMatchObject({ phase: 'completed', failed: 0 })
    expect(resumed.skipped).toBeGreaterThan(0)
    // Nothing requested twice across the two runs, but for project-wide lists.
    const repeated = second.calls.filter((c) => first.calls.includes(c) && !/^(otus|sources|news)\?/.test(c))
    expect(repeated).toEqual([])
  })

  it('stops during the project-wide lists when aborted', async () => {
    const store = tempStore()
    const controller = new AbortController()
    const { fetch, calls } = fakeFetch((key) => {
      if (key.startsWith('sources?')) {
        controller.abort()
        return { data: [{ id: 1, cached: 'A' }], headers: { 'pagination-total-pages': '40' } }
      }
      return tree(key)
    })

    const result = await sync(store, fetch, { signal: controller.signal })

    expect(result.phase).toBe('interrupted')
    expect(calls.filter((c) => c.startsWith('sources?'))).toHaveLength(1)
    expect(calls.some((c) => c.startsWith('otus/1?'))).toBe(false)
  })

  it('starts over when asked, or when the previous run completed', async () => {
    const store = tempStore()
    await sync(store, fakeFetch(tree).fetch)

    const again = fakeFetch(tree)
    const result = await sync(store, again.fetch)

    expect(result.run).toBe(2)
    expect(result.skipped).toBe(0)
    expect(again.calls).toContain('otus/1?extend[]=parents')
  })

  it('records a failing OTU and carries on', async () => {
    const store = tempStore()
    const { fetch } = fakeFetch((key) => (key.startsWith('otus/3?') ? { status: 500, data: {} } : tree(key)))

    const result = await sync(store, fetch)

    expect(result).toMatchObject({ done: 2, failed: 1 })
    expect(store.stats().failedOtus).toBe(1)
  })
})

describe('panelsInLayout', () => {
  it('collects each panel with its binds and rank limits', () => {
    const panels = panelsInLayout(
      {
        a: { panels: [[['panel:map', { id: 'panel:sounds', rank_group: ['GenusGroup'] }]]] },
        b: { rank_group: ['SpeciesGroup'], panels: [[['panel:map']]] }
      },
      (bind) => [bind]
    )

    expect(panels.get('panel:map')).toHaveLength(2)
    expect(panels.get('panel:sounds')[0].rankGroups).toEqual([[], ['GenusGroup']])
    expect(panels.get('panel:map')[1].rankGroups).toEqual([['SpeciesGroup'], []])
  })

  it('applies both tab and panel rank limits', () => {
    expect(isAvailableForRank([[], []], SPECIES)).toBe(true)
    expect(isAvailableForRank([['SpeciesGroup'], []], GENUS)).toBe(false)
    expect(isAvailableForRank([[], ['GenusGroup', 'SpeciesGroup']], SPECIES)).toBe(true)
  })
})

describe('recipes from packages', () => {
  const withPanel = (id, bind) => ({
    ...configuration,
    taxa_page: { overview: { panels: [[[{ id, bind }, 'panel:map']]] } }
  })

  it('runs a local panel recipe where the layout shows it, with its binds and rank limits', async () => {
    const projectRoot = tempDir()
    writeFiles(projectRoot, {
      'package.json': '{}',
      'panels/PanelEty/main.js': 'export default {}',
      'panels/PanelEty/offline.js': `
        export const panel = 'panel:ety'
        export const rankGroup = ['SpeciesGroup']
        export async function otu(ctx, binds) {
          await ctx.get('/taxon_name_classifications', { taxon_name_id: ctx.taxonId, per: binds[0].per })
        }`
    })
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { projectRoot, site: withPanel('panel:ety', { per: 5 }) })

    const requested = calls.filter((c) => c.startsWith('taxon_name_classifications'))
    expect(requested.sort()).toEqual([
      'taxon_name_classifications?taxon_name_id=20&per=5',
      'taxon_name_classifications?taxon_name_id=30&per=5'
    ])
  })

  it('runs recipes without a panel on every OTU, and project recipes once', async () => {
    const projectRoot = tempDir()
    writeFiles(projectRoot, {
      'package.json': JSON.stringify({ dependencies: { 'taxonpages-module-home': '1.0.0' } }),
      'modules/scrutiny/router/index.js': 'export default []',
      'modules/scrutiny/offline.js': `
        export async function otu(ctx) { await ctx.get('/data_attributes', { attribute_subject_id: ctx.otuId }) }`,
      'node_modules/taxonpages-module-home/package.json': JSON.stringify({
        name: 'taxonpages-module-home',
        version: '1.0.0',
        taxonpages: { type: 'module', offline: './sync/recipe.js' }
      }),
      'node_modules/taxonpages-module-home/src/router/index.js': 'export default []',
      'node_modules/taxonpages-module-home/sync/recipe.js': `
        export async function project(ctx) { await ctx.get('/taxon_names', { per: 3 }) }`
    })
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { projectRoot })

    expect(calls.filter((c) => c.startsWith('data_attributes'))).toHaveLength(3)
    expect(calls.filter((c) => c === 'taxon_names?per=3')).toHaveLength(1)
  })

  it('lets a package replace the core recipe of a panel it overrides', async () => {
    const projectRoot = tempDir()
    writeFiles(projectRoot, {
      'package.json': '{}',
      'panels/PanelMap/main.js': 'export default {}',
      'panels/PanelMap/offline.js': `
        export const panel = 'panel:map'
        export async function otu(ctx) { await ctx.get('/my/map/' + ctx.otuId) }`
    })
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { projectRoot })

    expect(calls).toContain('my/map/1')
    expect(calls.some((c) => c.includes('distribution'))).toBe(false)
  })

  it('fails the OTU with the package named when its recipe throws', async () => {
    const projectRoot = tempDir()
    writeFiles(projectRoot, {
      'package.json': '{}',
      'panels/PanelBad/main.js': 'export default {}',
      'panels/PanelBad/offline.js': `export async function otu() { throw new Error('boom') }`
    })
    const store = tempStore()
    const warnings = []
    const { fetch } = fakeFetch(tree)

    const result = await runSync({
      config: resolveOfflineConfig({ ...configuration, offline: { roots: [1], media: false } }, '/tmp'),
      store,
      remote: new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 10000, retries: 0, fetch }),
      configuration,
      packageRoot,
      projectRoot,
      logger: { info() {}, warn: (m) => warnings.push(m), error() {} }
    })

    expect(result.failed).toBe(3)
    expect(warnings[0]).toMatch(/PanelBad: boom/)
  })

  it('ignores a manifest path that leaves the package', async () => {
    const projectRoot = tempDir()
    writeFiles(projectRoot, {
      'package.json': JSON.stringify({ dependencies: { 'taxonpages-panel-evil': '1.0.0' } }),
      'node_modules/taxonpages-panel-evil/package.json': JSON.stringify({
        name: 'taxonpages-panel-evil',
        version: '1.0.0',
        taxonpages: { type: 'panel', offline: '../outside.js' }
      }),
      'node_modules/taxonpages-panel-evil/src/main.js': 'export default {}',
      'node_modules/outside.js': `export async function project(ctx) { await ctx.get('/pwned') }`
    })
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { projectRoot })

    expect(calls).not.toContain('pwned')
  })
})

describe('geographic scope', () => {
  const listing = (calls) => calls.find((c) => c.startsWith('otus?geo_shape_id'))
  const pages = (calls) =>
    calls.filter((c) => /^otus\/\d+\?extend\[\]=parents$/.test(c)).map((c) => Number(c.match(/\d+/)[0])).sort()

  it('syncs the OTUs recorded in an area, without walking their subtrees', async () => {
    const { fetch, calls } = fakeFetch(tree)

    const result = await sync(tempStore(), fetch, { roots: [], offline: { geographic_areas: [5] } })

    expect(listing(calls)).toBe('otus?geo_shape_id[]=5&geo_shape_type[]=GeographicArea&geo_mode=false&per=500&page=1')
    expect(pages(calls)).toEqual([2])
    expect(result).toMatchObject({ done: 1, failed: 0 })
  })

  it('limits an area to the subtrees of the roots', async () => {
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { roots: [1], offline: { geographic_areas: [5] } })

    expect(listing(calls)).toContain('&taxon_name_id[]=10&descendants=true')
    expect(pages(calls)).toEqual([1, 2]) // 1 only to read its taxon name
  })

  it('maps each match mode to TaxonWorks geo_mode', async () => {
    const exact = fakeFetch(tree)
    await sync(tempStore(), exact.fetch, { roots: [], offline: { geographic_areas: [5], geo_mode: 'exact' } })
    expect(listing(exact.calls)).not.toContain('geo_mode')

    const spatial = fakeFetch(tree)
    await sync(tempStore(), spatial.fetch, { roots: [], offline: { geographic_areas: [5], geo_mode: 'spatial' } })
    expect(listing(spatial.calls)).toContain('geo_mode=true')
  })

  it('adds the ancestors of every OTU in scope, without their subtrees', async () => {
    const { fetch, calls } = fakeFetch(tree)

    const result = await sync(tempStore(), fetch, { roots: [], offline: { geographic_areas: [5], include_ancestors: true } })

    // 2, then its breadcrumb (9, 1); not 1's other child, 3.
    expect(pages(calls)).toEqual([1, 2, 9])
    expect(result.done).toBe(3)
  })

  it('adds ancestors to a subtree too', async () => {
    const { fetch, calls } = fakeFetch(tree)

    await sync(tempStore(), fetch, { roots: [1], offline: { include_ancestors: true } })

    expect(pages(calls)).toEqual([1, 2, 3, 9])
  })

  it('starts a new run when the scope changes', async () => {
    const store = tempStore()
    const controller = new AbortController()
    const first = fakeFetch(tree)

    await sync(store, (url, init) => {
      if (url.includes('otus/2')) controller.abort()
      return first.fetch(url, init)
    }, { signal: controller.signal })

    const result = await sync(store, fakeFetch(tree).fetch, { offline: { include_ancestors: true } })

    expect(result.run).toBe(2)
    expect(result.skipped).toBe(0)
  })
})

describe('ancestorIds', () => {
  it('lists the OTU ids of a breadcrumb', async () => {
    const { ancestorIds } = await import('../src/sync/sync.js')
    expect(ancestorIds({ parents: { Root: [{ id: 9 }], Aus: [{ id: 1 }, { id: 4 }], Bad: null } })).toEqual([9, 1, 4])
  })
})
