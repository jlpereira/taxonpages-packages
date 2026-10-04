import { describe, it, expect } from 'vitest'
import { conflictingParams, filterToQuery, parseFilterUrl, parseQuery, stripControlParams } from '../src/filterUrl.js'
import { serializeParams } from '../src/params.js'
import { resolveOfflineConfig, scopeListingParams, syncScope } from '../src/config.js'

const HOST = 'https://tw.example.org'

describe('parseFilterUrl', () => {
  it('reads the URL of the OTU filter task', () => {
    const result = parseFilterUrl(`${HOST}/tasks/otus/filter?taxon_name_id[]=12&taxon_name_id[]=13&descendants=true&name=Aus`)

    expect(result).toEqual({
      params: { taxon_name_id: [12, 13], descendants: true, name: 'Aus' },
      source: 'otus',
      subquery: null,
      ignored: []
    })
  })

  it('reads percent-encoded brackets, as browsers copy them', () => {
    const { params } = parseFilterUrl(`${HOST}/tasks/otus/filter?tag_id%5B%5D=4&collection_object_query%5Bbuffered_determinations%5D=Aus%20bus`)

    expect(params).toEqual({ tag_id: [4], collection_object_query: { buffered_determinations: 'Aus bus' } })
  })

  it('nests the URL of another filter under its subquery', () => {
    const { params, source, subquery } = parseFilterUrl(
      `${HOST}/tasks/collection_objects/filter?collecting_event_query[country]=Argentina&preparation_type_id[]=3`
    )

    expect(source).toBe('collection_objects')
    expect(subquery).toBe('collection_object_query')
    expect(params).toEqual({
      collection_object_query: { collecting_event_query: { country: 'Argentina' }, preparation_type_id: [3] }
    })
  })

  it('maps the content filter, whose task path is singular', () => {
    expect(parseFilterUrl(`${HOST}/tasks/content/filter?topic_id[]=2`).params).toEqual({ content_query: { topic_id: [2] } })
  })

  it('ignores paging, tokens and response shape, at every level', () => {
    const { params, ignored } = parseFilterUrl(
      `${HOST}/tasks/otus/filter?per=50&page=3&project_token=abc&extend[]=parents&tag_id[]=1&taxon_name_query[per]=10&taxon_name_query[name]=Aus`
    )

    expect(params).toEqual({ tag_id: [1], taxon_name_query: { name: 'Aus' } })
    expect(ignored).toEqual(['per', 'page', 'project_token', 'extend', 'taxon_name_query[per]'])
  })

  it('accepts the API request of a filter and a bare query', () => {
    expect(parseFilterUrl(`${HOST}/api/v1/otus?tag_id[]=1&token=x`).params).toEqual({ tag_id: [1] })
    expect(parseFilterUrl(`${HOST}/otus/filter.json?tag_id[]=1`).params).toEqual({ tag_id: [1] })
    expect(parseFilterUrl('?tag_id[]=1').params).toEqual({ tag_id: [1] })
    expect(parseFilterUrl('tag_id[]=1').params).toEqual({ tag_id: [1] })
  })

  it('refuses a filter OTUs cannot be filtered by', () => {
    expect(() => parseFilterUrl(`${HOST}/tasks/people/filter?name=Smith`)).toThrow("OTUs can't be filtered by a people filter")
  })

  it('refuses a URL with nothing but paging', () => {
    expect(() => parseFilterUrl(`${HOST}/tasks/otus/filter?per=50&page=1`)).toThrow('no filter parameters')
    expect(() => parseFilterUrl('')).toThrow('Paste the URL')
  })

  it('keeps leading zeros and long numbers as text', () => {
    expect(parseFilterUrl('identifier=007&identifier_end=1234567890123456789').params).toEqual({
      identifier: '007',
      identifier_end: '1234567890123456789'
    })
  })
})

describe('parseQuery', () => {
  it('is the inverse of serializeParams', () => {
    const params = {
      taxon_name_id: [1, 2],
      descendants: true,
      name: 'Aus bus',
      collection_object_query: { collecting_event_query: { country: 'Argentina', geo_shape_id: [5] }, tag_id: [7] }
    }

    expect(parseQuery(serializeParams(params))).toEqual(params)
  })

  it('refuses keys nested inside arrays', () => {
    expect(() => parseQuery([['a[][b]', '1']])).toThrow('Unsupported parameter')
  })
})

describe('stripControlParams', () => {
  it('drops empty values and what is left empty', () => {
    expect(stripControlParams({ a: '', b: [], c: { per: 5 }, d: [1, ''], e: 0 }).params).toEqual({ d: [1], e: 0 })
  })

  it('reads anything that is not an object as no filter', () => {
    expect(stripControlParams('tag_id=1').params).toEqual({})
    expect(stripControlParams(null).params).toEqual({})
  })
})

describe('filter scope', () => {
  const config = (offline) => resolveOfflineConfig({ url: HOST, offline }, '/tmp')

  it('cleans otu_filter edited by hand', () => {
    expect(config({ otu_filter: { tag_id: [1], per: 50, project_token: 'x' } }).otuFilter).toEqual({ tag_id: [1] })
  })

  it('is part of the scope of a run, only when set', () => {
    expect(syncScope(config({})).otuFilter).toBeUndefined()
    expect(syncScope(config({ otu_filter: { tag_id: [1], name: 'Aus' } })).otuFilter).toBe('name=Aus&tag_id[]=1')
  })

  it('names the filter the same whatever the order of its keys', () => {
    expect(filterToQuery({ b: 1, a: [2, 1] })).toBe(filterToQuery({ a: [2, 1], b: 1 }))
  })

  it('joins areas, filter and roots in one listing', () => {
    const params = scopeListingParams(config({ geographic_areas: [5], otu_filter: { tag_id: [1] } }), [10])

    expect(params).toEqual({
      geo_shape_id: [5],
      geo_shape_type: ['GeographicArea'],
      geo_mode: false,
      tag_id: [1],
      taxon_name_id: [10],
      descendants: true
    })
  })

  it('refuses a filter setting what the areas or the roots set', () => {
    const byArea = config({ geographic_areas: [5], otu_filter: { geo_shape_id: [6] } })
    expect(() => scopeListingParams(byArea)).toThrow('geo_shape_id, which the geographic areas set too')

    const byRoot = config({ otu_filter: { taxon_name_id: [3] } })
    expect(() => scopeListingParams(byRoot, [10])).toThrow('taxon_name_id, which the OTUs chosen set too')

    // Alone, the filter may set them.
    expect(scopeListingParams(byRoot)).toEqual({ taxon_name_id: [3] })
    expect(conflictingParams({ geo_shape_id: [6] })).toEqual([])
  })
})
