import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { canonicalKey, keyFor, normalizePath, serializeParams } from '../src/params.js'

/** The key of the URL axios builds for a request, as the server receives it. */
function keyFromAxios(path, params) {
  const url = new URL(axios.getUri({ baseURL: 'http://x/offline/api/v1', url: path, params }))
  return canonicalKey(url.pathname.replace('/offline/api/v1', ''), url.searchParams)
}

// Every params shape the core panels send (see src/sync/recipes.js).
const SITE_REQUESTS = [
  ['/otus/1', { extend: ['parents'] }],
  ['/otus/1/inventory/taxonomy.json', { max_descendants_depth: 0, extend: ['common_names'] }],
  ['/otus/1/inventory/images.json', {
    extend: ['depictions', 'attribution', 'source', 'citations'],
    otu_scope: ['all', 'coordinate_otus'],
    sort_order: ['Otu', 'CollectionObject']
  }],
  ['/otus/1/inventory/images.json', { extend: ['depictions'], sort_order: [] }],
  ['/otus/1/inventory/content', { topic_id: [2, 3], extend: ['depiction'] }],
  ['/biological_associations/basic', {
    'otu_query[coordinatify]': true,
    'otu_query[otu_id][]': 1,
    per: 50,
    page: 1,
    extend: ['object', 'subject']
  }],
  ['/depictions/gallery', { depiction_object_type: ['BiologicalAssociation'], depiction_object_id: [], per: 200 }],
  ['/observation_matrices/3/image_matrix', { otu_filter: undefined, page: 1, per: 50 }],
  ['/sources', { in_project: true, query_term: 'Smith & Jones, 1901', year_start: null }],
  ['/news', { news_id: [4, 5] }],
  ['/otus', { taxon_name_id: [9], descendants: true, geo_json: '{"type":"Point"}' }]
]

describe('serializeParams', () => {
  it.each(SITE_REQUESTS)('names %s exactly as axios sends it', (path, params) => {
    expect(keyFor(path, params)).toBe(keyFromAxios(path, params))
  })

  it('serializes nested objects with brackets', () => {
    expect(serializeParams({ a: { b: 1, c: [2] } })).toEqual([['a[b]', '1'], ['a[c][]', '2']])
  })
})

describe('canonicalKey', () => {
  it('ignores the project token and parameter order between keys', () => {
    expect(canonicalKey('/otus/1', [['b', '2'], ['project_token', 'x'], ['a', '1']]))
      .toBe(canonicalKey('otus/1/', [['a', '1'], ['b', '2']]))
  })

  it('keeps the order of repeated keys', () => {
    expect(canonicalKey('/x', [['s[]', 'Otu'], ['s[]', 'Observation']]))
      .not.toBe(canonicalKey('/x', [['s[]', 'Observation'], ['s[]', 'Otu']]))
  })
})

describe('normalizePath', () => {
  it('treats .json as the default format but keeps other extensions', () => {
    expect(normalizePath('/otus/1/inventory/distribution.json')).toBe('otus/1/inventory/distribution')
    expect(normalizePath('/otus/1/inventory/distribution.geojson')).toBe('otus/1/inventory/distribution.geojson')
  })
})
