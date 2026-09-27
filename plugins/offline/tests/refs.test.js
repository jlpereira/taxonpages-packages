import { describe, it, expect } from 'vitest'
import { deflate, inflate } from '../src/refs.js'

function memoryBlobs() {
  const blobs = new Map()
  let counter = 0
  return {
    blobs,
    put: (text) => {
      for (const [hash, stored] of blobs) if (stored === text) return hash
      const hash = `h${counter++}`
      blobs.set(hash, text)
      return hash
    },
    get: (hash) => blobs.get(hash)
  }
}

function polygon(seed, points = 200) {
  return [[Array.from({ length: points }, (_, i) => [seed + i / 1000, -(seed + i / 1000)])]]
}

describe('deflate / inflate', () => {
  it('round-trips any value', () => {
    const { put, get } = memoryBlobs()
    const value = {
      a: [1, 'two', null, true, { b: 'x'.repeat(5000) }],
      geometry: { type: 'MultiPolygon', coordinates: polygon(1) },
      record: { id: 1, global_id: 'gid://taxon-works/Otu/1', object_tag: '<i>A</i>'.repeat(40) }
    }

    expect(inflate(deflate(value, put), get)).toEqual(value)
  })

  it('stores a geometry once whether it arrives as an object or as a JSON string', () => {
    const { put, get, blobs } = memoryBlobs()
    const geometry = { type: 'MultiPolygon', coordinates: polygon(2, 400) }

    // distribution.json carries the aggregate map as a string...
    const asString = { cached_map: { id: 7, geo_json: JSON.stringify(geometry) } }
    // ...and distribution.geojson as an object, with properties beside it.
    const asObject = { features: [{ ...geometry, properties: { aggregate: true } }] }

    const a = deflate(asString, put)
    const b = deflate(asObject, put)

    expect(blobs.size).toBe(1)
    expect(inflate(a, get)).toEqual(asString)
    expect(inflate(b, get)).toEqual(asObject)
  })

  it('shares the same shape across responses', () => {
    const { put, blobs } = memoryBlobs()
    const shape = { type: 'MultiPolygon', coordinates: polygon(3) }

    deflate({ features: [{ geometry: shape, properties: { base: { id: 1 } } }] }, put)
    deflate({ features: [{ geometry: shape, properties: { base: { id: 2 } } }] }, put)

    expect(blobs.size).toBe(1)
  })

  it('shares repeated TaxonWorks records, such as parent OTUs', () => {
    const { put, get, blobs } = memoryBlobs()
    const parent = { id: 9, global_id: 'gid://taxon-works/Otu/9', object_tag: '<span class="otu_tag">Root</span>'.repeat(8) }

    const a = deflate({ id: 1, parents: { Root: [parent] } }, put)
    const b = deflate({ id: 2, parents: { Root: [parent] } }, put)

    expect(blobs.size).toBe(1)
    expect(inflate(b, get).parents.Root[0]).toEqual(parent)
    expect(JSON.stringify(a).length).toBeLessThan(JSON.stringify(parent).length)
  })

  it('leaves small values inline', () => {
    const { put, blobs } = memoryBlobs()
    deflate({ coordinates: [1, 2], text: 'short', record: { global_id: 'g', id: 1 } }, put)
    expect(blobs.size).toBe(0)
  })

  it('does not mistake real data for a marker', () => {
    const { put, get } = memoryBlobs()
    const value = { list: [{ $ref: 'not-a-hash' }, { $json: 1 }] }

    expect(inflate(deflate(value, put), get)).toEqual(value)
  })

  it('keeps a long string that is not exact JSON as a string', () => {
    const { put, get } = memoryBlobs()
    const text = `{"a": 1, ${'"b": 2, '.repeat(1000)}"c": 3}` // spaces: not what JSON.stringify writes

    expect(inflate(deflate({ text }, put), get).text).toBe(text)
  })
})
