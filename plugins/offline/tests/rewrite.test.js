import { describe, it, expect } from 'vitest'
import { rewriteUrls } from '../src/rewrite.js'
import { API_PREFIX, MEDIA_PREFIX } from '../src/config.js'

const sourceUrl = 'https://tw.example.org/api/v1'

describe('rewriteUrls', () => {
  it('points API URLs at the local API, and downloaded files at their copy', () => {
    const findMedia = (url) => (url === 'https://tw.example.org/s/t1' ? { hash: 'abc' } : null)

    expect(
      rewriteUrls(
        { a: `${sourceUrl}/images/1`, b: 'https://tw.example.org/s/t1', c: 'https://elsewhere.org/x', d: 'text' },
        { sourceUrl, findMedia }
      )
    ).toEqual({ a: `${API_PREFIX}/images/1`, b: `${MEDIA_PREFIX}/abc`, c: 'https://elsewhere.org/x', d: 'text' })
  })

  it('rewrites every URL of a list separated by |', () => {
    const associatedMedia = `${sourceUrl}/images/aa | ${sourceUrl}/images/bb|https://elsewhere.org/c`

    expect(rewriteUrls({ associatedMedia }, { sourceUrl }).associatedMedia).toBe(
      `${API_PREFIX}/images/aa | ${API_PREFIX}/images/bb|https://elsewhere.org/c`
    )
  })
})
