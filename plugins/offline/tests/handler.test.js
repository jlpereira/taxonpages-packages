import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { createHandlers } from '../src/server/handler.js'
import { createMissLogger, readMisses } from '../src/misses.js'
import { RemoteClient } from '../src/remote.js'
import { resolveOfflineConfig } from '../src/config.js'
import { saveMedia } from '../src/media.js'
import { tempStore, fakeFetch } from './helpers.js'

const SOURCE = 'https://tw.example.org/api/v1'

function setup({ mode = 'strict', logMisses = true, proxyStore = true, routes = {} } = {}) {
  const store = tempStore()
  const config = {
    ...resolveOfflineConfig({ url: SOURCE, project_token: 't', offline: { mode } }, '/tmp'),
    proxyStore,
    missesFile: join(store.path, '..', 'misses.jsonl')
  }
  const { fetch, calls } = fakeFetch(routes)
  const remote = mode === 'proxy' ? new RemoteClient({ url: SOURCE, token: 't', requestsPerSecond: 1000, retries: 0, fetch }) : null
  const handlers = createHandlers({
    config,
    store,
    remote,
    logMiss: createMissLogger(config.missesFile, logMisses),
    logger: { error() {} }
  })

  return { store, config, handlers, calls }
}

/** Call a handler with a minimal request and collect the response. */
async function call(handler, url) {
  const chunks = []
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    }
  })
  res.statusCode = 0
  res.headers = {}
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value
  }

  const finished = new Promise((resolve) => res.on('finish', resolve))
  await handler({ method: 'GET', url }, res)
  await finished

  const body = Buffer.concat(chunks).toString('utf8')
  return { status: res.statusCode, headers: res.headers, json: () => JSON.parse(body), body }
}

describe('API handler', () => {
  it('answers a stored response whatever the parameter order and token', async () => {
    const { store, handlers } = setup()
    store.putResponse('otus/1?extend%5B%5D=parents&x=1', { status: 200, headers: { 'pagination-total': '1' }, data: { id: 1 } })

    const res = await call(handlers.api, '/otus/1.json?x=1&project_token=abc&extend[]=parents')

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ id: 1 })
    expect(res.headers['pagination-total']).toBe('1')
  })

  it('points remote API links and downloaded media at this server', async () => {
    const { store, handlers } = setup()
    saveMedia(store, 'https://tw.example.org/s/abc', { status: 200, buffer: Buffer.from('jpg'), contentType: 'image/jpeg' })
    store.putResponse('otus/1/inventory/images', {
      status: 200,
      data: {
        thumb: 'https://tw.example.org/s/abc',
        medium: 'https://tw.example.org/s/not-downloaded',
        link: `${SOURCE}/images/5`
      }
    })

    const data = (await call(handlers.api, '/otus/1/inventory/images.json')).json()

    expect(data.thumb).toMatch(/^\/offline\/media\/[0-9a-f]{32}$/)
    expect(data.medium).toBe('https://tw.example.org/s/not-downloaded')
    expect(data.link).toBe('/offline/api/v1/images/5')

    const media = await call(handlers.media, `/${data.thumb.split('/').pop()}`)
    expect(media.status).toBe(200)
    expect(media.headers['content-type']).toBe('image/jpeg')
  })

  it('serves images the site requests through the API', async () => {
    const { store, handlers } = setup()
    saveMedia(store, 'images/5/scale_to_box/0/0/10/10/10/10', { status: 200, buffer: Buffer.from('png'), contentType: 'image/png' })

    const res = await call(handlers.api, '/images/5/scale_to_box/0/0/10/10/10/10?project_token=x')
    expect(res.headers['content-type']).toBe('image/png')
  })

  it('answers 404 in strict mode and records the miss once', async () => {
    const { handlers, config } = setup()

    const first = await call(handlers.api, '/otus/99')
    await call(handlers.api, '/otus/99?project_token=again')

    expect(first.status).toBe(404)
    expect(readMisses(config.missesFile)).toEqual([
      expect.objectContaining({ key: 'otus/99', resolved: 'none', count: 1 })
    ])
  })

  it('records nothing when miss logging is off', async () => {
    const { handlers, config } = setup({ logMisses: false })
    await call(handlers.api, '/otus/99')
    expect(existsSync(config.missesFile)).toBe(false)
  })

  it('fetches and keeps a missing response in proxy mode', async () => {
    const { handlers, store, calls, config } = setup({
      mode: 'proxy',
      routes: { 'otus/5': { data: { id: 5, thumb: 'x' } } }
    })

    const first = await call(handlers.api, '/otus/5')
    const second = await call(handlers.api, '/otus/5')

    expect(first.json()).toEqual({ id: 5, thumb: 'x' })
    expect(second.json()).toEqual({ id: 5, thumb: 'x' })
    expect(calls).toEqual(['otus/5'])
    expect(store.getResponse('otus/5')).toBeTruthy()
    expect(readMisses(config.missesFile)[0]).toMatchObject({ key: 'otus/5', resolved: 'proxy' })
  })

  it('proxies without keeping when proxy_store is off', async () => {
    const { handlers, store, calls } = setup({
      mode: 'proxy',
      proxyStore: false,
      routes: { 'otus/5': { data: { id: 5 } } }
    })

    await call(handlers.api, '/otus/5')
    await call(handlers.api, '/otus/5')

    expect(calls).toHaveLength(2)
    expect(store.getResponse('otus/5')).toBeNull()
  })

  it('answers the OTU autocomplete from the search table', async () => {
    const { handlers, store } = setup()
    store.putOtu({ id: 1, taxon_name_id: 2, global_id: 'g1', object_tag: '<i>Aphis fabae</i>' }, 'Aphis fabae')
    store.putOtu({ id: 3, taxon_name_id: null, global_id: 'g3', object_tag: 'Aphis sp. 1' }, 'Aphis sp 1')

    const all = (await call(handlers.api, '/otus/autocomplete?term=aph')).json()
    const named = (await call(handlers.api, '/otus/autocomplete?term=aph&having_taxon_name_only=true')).json()

    expect(all.map((o) => o.id).sort()).toEqual([1, 3])
    expect(named).toEqual([{ id: 1, gid: 'g1', otu_valid_id: 1, label: 'Aphis fabae', label_html: '<i>Aphis fabae</i>' }])
  })

  it('pages sources with TaxonWorks pagination headers', async () => {
    const { handlers, store } = setup()
    for (let id = 1; id <= 3; id += 1) store.putSource({ id, cached: `Author ${id}`, year: 1900 + id })

    const res = await call(handlers.api, '/sources?in_project=true&per=2&page=2')

    expect(res.json().map((s) => s.id)).toEqual([3])
    expect(res.headers).toMatchObject({
      'pagination-page': '2',
      'pagination-per-page': '2',
      'pagination-total': '3',
      'pagination-total-pages': '2'
    })
  })

  it('refuses media paths that are not hashes', async () => {
    const { handlers } = setup()
    expect((await call(handlers.media, '/../../etc/passwd')).status).toBe(404)
  })
})

describe('miss log file', () => {
  it('is JSON lines', async () => {
    const { handlers, config } = setup()
    await call(handlers.api, '/a')
    await call(handlers.api, '/b')

    const lines = readFileSync(config.missesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.key)).toEqual(['a', 'b'])
  })
})

describe('RemoteClient.fetchUrl', () => {
  it('adds the project token to files served through the API only', async () => {
    const seen = []
    const fetch = async (url) => {
      seen.push(url)
      return new Response('x', { headers: { 'content-type': 'image/png' } })
    }
    const remote = new RemoteClient({ url: SOURCE, token: 'tok', requestsPerSecond: 1000, fetch })

    await remote.fetchUrl(`${SOURCE}/images/5/scale_to_box/0/0/1/1/1/1`)
    await remote.fetchUrl('https://tw.example.org/s/abc')

    expect(seen).toEqual([`${SOURCE}/images/5/scale_to_box/0/0/1/1/1/1?project_token=tok`, 'https://tw.example.org/s/abc'])
  })
})

describe('DwC filter OTU list', () => {
  it('lists OTUs in name order without filters, and defers filtered lists', async () => {
    const { handlers, store } = setup()
    store.putOtu({ id: 1, object_tag: '<i>Zeta</i>' }, 'Zeta')
    store.putOtu({ id: 2, object_tag: '<i>Alpha</i>' }, 'Alpha')

    const plain = await call(handlers.api, '/otus/inventory/alphabetical?page=1&per=50')
    const filtered = await call(handlers.api, '/otus/inventory/alphabetical?dwc_occurrence_query[country]=Peru')

    expect(plain.json().map((o) => o.id)).toEqual([2, 1])
    expect(plain.headers['pagination-total']).toBe('2')
    expect(filtered.status).toBe(404)
  })
})

describe('breadcrumb parents', () => {
  const PAGE = 'otus/3?extend%5B%5D=parents'
  const otuPage = (id, parents = {}) => ({
    status: 200,
    data: { id, global_id: `gid://taxon-works/Otu/${id}`, object_tag: `Taxon ${id}`, parents }
  })
  const parents = {
    Root: [{ id: 1, name: null, object_tag: 'Root' }],
    Aus: [{ id: 2, name: null, object_tag: 'Aus' }]
  }

  it('drops the id of parents whose page is not stored, in strict mode', async () => {
    const { handlers, store } = setup()
    store.putResponse(PAGE, otuPage(3, parents))
    store.putResponse('otus/2?extend%5B%5D=parents', otuPage(2))

    const data = (await call(handlers.api, '/otus/3?extend[]=parents')).json()

    expect(data.parents.Root).toEqual([{ name: null, object_tag: 'Root' }])
    expect(data.parents.Aus).toEqual([{ id: 2, name: null, object_tag: 'Aus' }])
  })

  it('counts a stored 404 page as not reachable', async () => {
    const { handlers, store } = setup()
    store.putResponse(PAGE, otuPage(3, parents))
    store.putResponse('otus/2?extend%5B%5D=parents', { status: 404, data: {} })

    const data = (await call(handlers.api, '/otus/3?extend[]=parents')).json()

    expect(data.parents.Aus[0]).not.toHaveProperty('id')
  })

  it('keeps every parent linked in proxy mode', async () => {
    const { handlers, store } = setup({ mode: 'proxy' })
    store.putResponse(PAGE, otuPage(3, parents))

    const data = (await call(handlers.api, '/otus/3?extend[]=parents')).json()

    expect(data.parents.Root[0].id).toBe(1)
  })

  it('leaves the stored response untouched', async () => {
    const { handlers, store } = setup()
    store.putResponse(PAGE, otuPage(3, parents))

    await call(handlers.api, '/otus/3?extend[]=parents')

    expect(store.getResponse(PAGE).data.parents).toEqual(parents)
  })
})
