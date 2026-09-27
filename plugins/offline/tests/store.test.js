import { describe, it, expect } from 'vitest'
import { tempStore } from './helpers.js'

describe('OfflineStore', () => {
  it('returns a stored JSON response as it was put', () => {
    const store = tempStore()
    const data = { id: 1, list: [1, 2, { geo: { coordinates: Array.from({ length: 300 }, (_, i) => [i, i]) } }] }

    store.putResponse('otus/1', { status: 200, headers: { 'pagination-total': '3' }, data })

    expect(store.getResponse('otus/1')).toEqual({
      status: 200,
      headers: { 'pagination-total': '3' },
      kind: 'json',
      data
    })
  })

  it('stores error answers and text bodies too', () => {
    const store = tempStore()

    store.putResponse('otus/1/inventory/distribution', { status: 404, data: { error: 'no map available' } })
    store.putResponse('otus/1/inventory/dwc.csv', { status: 200, headers: { 'content-type': 'text/csv' }, text: 'a\tb\n1\t2' })

    expect(store.getResponse('otus/1/inventory/distribution').status).toBe(404)
    expect(store.getResponse('otus/1/inventory/dwc.csv').text).toBe('a\tb\n1\t2')
    expect(store.getResponse('missing')).toBeNull()
  })

  it('knows which run stored a response', () => {
    const store = tempStore()
    store.putResponse('stats', { status: 200, data: {}, run: 2 })

    expect(store.hasResponseFromRun('stats', 2)).toBe(true)
    expect(store.hasResponseFromRun('stats', 3)).toBe(false)
  })

  it('searches OTUs with accents and prefixes', () => {
    const store = tempStore()
    store.putOtu({ id: 1, taxon_name_id: 10, object_tag: '<i>Aphis</i> fabæ' }, 'Aphis Linnæus')
    store.putOtu({ id: 2, taxon_name_id: 11, object_tag: '<i>Bombus</i>' }, 'Bombus Latreille')
    store.putOtu({ id: 1, taxon_name_id: 10, object_tag: '<i>Aphis</i>' }, 'Aphis Linné')

    expect(store.searchOtus('"aph"*', 10).map((o) => o.id)).toEqual([1])
    expect(store.searchOtus('"linne"*', 10).map((o) => o.id)).toEqual([1])
    expect(store.searchOtus('"linnaeus"*', 10)).toEqual([])
  })

  it('filters and pages sources', () => {
    const store = tempStore()
    store.putSource({ id: 1, cached: 'Smith, 1900. A.', cached_author_string: 'Smith', year: 1900 })
    store.putSource({ id: 2, cached: 'Jones, 1950. B.', cached_author_string: 'Jones', year: 1950 })
    store.putSource({ id: 3, cached: 'Smith, 1960. C.', cached_author_string: 'Smith', year: 1960 })

    expect(store.querySources({ author: 'smith', page: 1, per: 1 })).toMatchObject({
      total: 2,
      records: [{ id: 1 }]
    })
    expect(store.querySources({ yearStart: 1940, page: 1, per: 10 }).records.map((s) => s.id)).toEqual([2, 3])
  })

  it('orders news newest first and filters by id', () => {
    const store = tempStore()
    store.putNews({ id: 1, created_at: '2024-01-01T00:00:00Z' })
    store.putNews({ id: 2, created_at: '2025-01-01T00:00:00Z' })

    expect(store.queryNews({ page: 1, per: 10 }).records.map((n) => n.id)).toEqual([2, 1])
    expect(store.queryNews({ ids: [1], page: 1, per: 10 }).total).toBe(1)
  })
})

describe('schema version', () => {
  it('refuses a database from another schema version', async () => {
    const { OfflineStore } = await import('../src/store.js')
    const store = tempStore()
    store.setMeta('schema_version', 1)
    store.close()

    expect(() => new OfflineStore(store.path)).toThrow(/Delete it and run/)
  })
})
