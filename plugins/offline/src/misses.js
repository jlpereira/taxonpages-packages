import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { unavailableReason } from './recipes/index.js'

/**
 * Record requests the local database could not answer, one JSON object per
 * line, so the sync can be extended to cover them.
 *
 * Each distinct request is written once per process: a page reloaded a hundred
 * times is still one gap.
 *
 * @param {string} file
 * @param {boolean} enabled
 * @returns {(key: string, resolved: 'proxy'|'none', status?: number) => void}
 */
export function createMissLogger(file, enabled) {
  if (!enabled) return () => {}

  const seen = new Set()
  let ready = false

  return (key, resolved, status) => {
    const id = `${resolved} ${key}`
    if (seen.has(id)) return
    seen.add(id)

    try {
      if (!ready) {
        mkdirSync(dirname(file), { recursive: true })
        ready = true
      }

      appendFileSync(
        file,
        JSON.stringify({ time: new Date().toISOString(), key, resolved, status }) + '\n'
      )
    } catch {
      // Logging is best effort: never fail a page because of it
    }
  }
}

/**
 * Summarize the miss log: one entry per request, most frequent first, with
 * why it cannot be synced when a recipe says (`unavailable`).
 *
 * @param {string} file
 * @returns {Array<{ key: string, count: number, last: string, resolved: string, reason: string|null }>}
 */
export function readMisses(file) {
  if (!existsSync(file)) return []

  const byKey = new Map()

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue

    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    const current = byKey.get(entry.key) || { key: entry.key, count: 0, last: '', resolved: entry.resolved }
    current.count += 1
    if (entry.time > current.last) {
      current.last = entry.time
      current.resolved = entry.resolved
    }
    byKey.set(entry.key, current)
  }

  return [...byKey.values()]
    .map((miss) => ({ ...miss, reason: unavailableReason(miss.key) }))
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
}
