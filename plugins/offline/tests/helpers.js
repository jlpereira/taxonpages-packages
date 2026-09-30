import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'
import sharp from 'sharp'
import { OfflineStore } from '../src/store.js'

const created = []

afterEach(() => {
  while (created.length) {
    const { dir, store } = created.pop()
    try {
      store?.close()
    } catch {
      // already closed by the test
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A throwaway directory, removed after the test. */
export function tempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tp-offline-')))
  created.push({ dir })
  return dir
}

/** A fresh database in a throwaway directory. */
export function tempStore() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tp-offline-')))
  const store = new OfflineStore(join(dir, 'offline.db'))
  created.push({ dir, store })
  return store
}

/**
 * A fetch stand-in answering from a map of `path?query` (without the project
 * token) to a response spec: { status?, data?, text?, headers?, body? }.
 * Unknown requests answer 404. Every request is recorded in `calls`.
 */
export function fakeFetch(routes, { base = 'https://tw.example.org/api/v1' } = {}) {
  const calls = []

  const fetch = async (url) => {
    const parsed = new URL(url)
    parsed.searchParams.delete('project_token')
    const path = parsed.href.startsWith(base) ? parsed.pathname.slice(new URL(base).pathname.length + 1) : parsed.href
    const query = parsed.searchParams.toString()
    const key = parsed.href.startsWith(base) ? (query ? `${path}?${decodeURIComponent(query)}` : path) : parsed.href

    calls.push(key)

    const spec = routes[key] ?? (typeof routes === 'function' ? routes(key) : undefined)
    if (!spec) return new Response(JSON.stringify({ success: false }), { status: 404, headers: { 'content-type': 'application/json' } })

    if (spec.body) {
      return new Response(spec.body, { status: spec.status ?? 200, headers: { 'content-type': spec.contentType || 'image/jpeg' } })
    }

    return new Response(spec.text ?? JSON.stringify(spec.data), {
      status: spec.status ?? 200,
      headers: { 'content-type': spec.text ? 'text/csv' : 'application/json', ...(spec.headers || {}) }
    })
  }

  return { fetch, calls }
}

/** A JPEG of the given size, with some detail so it compresses like a photo. */
export function jpeg(width, height) {
  const noise = Buffer.alloc(width * height * 3)
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7919) % 251
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
}

/** Write files (path relative to root → content) under a directory. */
export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}
