import { describe, it, expect } from 'vitest'
import { collectMedia } from '../src/media.js'

const sourceUrl = 'https://tw.example.org/api/v1'

describe('collectMedia', () => {
  it('collects only the sizes the site displays', () => {
    const data = {
      images: {
        5: {
          original_png: '/api/v1/images/5/scale_to_box/0/0/10/10/10/10',
          thumb: 'https://tw.example.org/s/t1',
          medium: 'https://tw.example.org/s/m1'
        }
      },
      sounds: [{ sound_file: 'https://tw.example.org/files/sounds/1.mp3' }],
      figures: [{ original: `${sourceUrl}/images/6/as_png?x=1` }]
    }

    expect(collectMedia(data, { sourceUrl })).toEqual([
      { key: 'images/5/scale_to_box/0/0/10/10/10/10', url: 'https://tw.example.org/api/v1/images/5/scale_to_box/0/0/10/10/10/10' },
      { key: 'https://tw.example.org/s/t1', url: 'https://tw.example.org/s/t1' },
      { key: 'https://tw.example.org/files/sounds/1.mp3', url: 'https://tw.example.org/files/sounds/1.mp3' },
      { key: 'images/6/as_png', url: `${sourceUrl}/images/6/as_png?x=1` }
    ])
  })

  it('ignores non-URL values in media fields', () => {
    expect(collectMedia({ thumb: 'missing.png', image: { id: 1 } }, { sourceUrl })).toEqual([])
  })
})
