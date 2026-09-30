/** Whether a response is a success, the way the panels test it. */
export function ok(response) {
  return response && response.status >= 200 && response.status < 300
}

/** The first item of each key, in order. */
export function uniqueBy(list, keyOf) {
  const seen = new Map()
  for (const item of list) {
    const key = keyOf(item) ?? 'undefined'
    if (!seen.has(key)) seen.set(key, item)
  }
  return [...seen.values()]
}
