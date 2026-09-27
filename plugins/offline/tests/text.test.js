import { describe, it, expect } from 'vitest'
import { stripTags } from '../src/text.js'

describe('stripTags', () => {
  it('keeps the text of a label and decodes entities', () => {
    expect(stripTags('<span class="otu_tag"><i>Microcentrum</i> Scudder, 1862 &#10003; &amp; co</span>'))
      .toBe('Microcentrum Scudder, 1862 ✓ & co')
  })
})
