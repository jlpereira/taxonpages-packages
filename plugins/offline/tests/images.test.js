import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import sharp from 'sharp'
import { createImageConverter } from '../src/images.js'
import { convertStoredImages } from '../src/convertImages.js'
import { saveMedia } from '../src/media.js'
import { resolveOfflineConfig } from '../src/config.js'
import { tempStore, jpeg } from './helpers.js'

const SOURCE = 'https://tw.example.org/api/v1'

const settings = (images) => resolveOfflineConfig({ offline: { images } }).images

describe('createImageConverter', () => {
  it('keeps images as sent unless a format is set', async () => {
    expect(await createImageConverter(settings({}))).toBeNull()
    expect(await createImageConverter(settings({ format: 'original' }))).toBeNull()
  })

  it('converts and shrinks images of the configured fields', async () => {
    const converter = await createImageConverter(settings({ format: 'webp', max_size: 400 }))
    const input = await jpeg(1200, 600)

    const output = await converter.convert(input, 'image/jpg')
    const metadata = await sharp(output.buffer).metadata()

    expect(output).toMatchObject({ converted: true, contentType: 'image/webp' })
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 400, 200])
    expect(output.buffer.length).toBeLessThan(input.length)

    expect(converter.appliesTo('original_png')).toBe(true)
    expect(converter.appliesTo('thumb')).toBe(false)
  })

  it('leaves alone what already matches, and what is not a raster image', async () => {
    const converter = await createImageConverter(settings({ format: 'jpeg', max_size: 400 }))

    const small = await jpeg(300, 200)
    expect(await converter.convert(small, 'image/jpeg')).toMatchObject({ converted: false, buffer: small })

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(await converter.convert(svg, 'image/svg+xml')).toMatchObject({ converted: false, buffer: svg })
  })
})

describe('convertStoredImages', () => {
  it('converts downloaded images of the configured fields, once', async () => {
    const store = tempStore()
    const full = 'images/5/scale_to_box/0/0/1200/600/1200/600'
    const thumb = 'https://tw.example.org/s/t5'

    store.putResponse('otus/1/inventory/images', {
      status: 200,
      data: { images: { 5: { original_png: `/api/v1/${full}`, thumb } } }
    })
    const before = saveMedia(store, full, { status: 200, buffer: await jpeg(1200, 600), contentType: 'image/jpg' })
    saveMedia(store, thumb, { status: 200, buffer: await jpeg(100, 50), contentType: 'image/jpg' })

    const config = resolveOfflineConfig({ url: SOURCE, offline: { images: { format: 'webp', max_size: 400 } } })
    const result = await convertStoredImages({ store, config })

    expect(result).toMatchObject({ total: 1, converted: 1 })
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore)
    expect(store.getMedia(full).content_type).toBe('image/webp')
    expect(store.getMedia(thumb).content_type).toBe('image/jpg')
    expect(existsSync(store.mediaPath(before))).toBe(false)

    expect(await convertStoredImages({ store, config })).toMatchObject({ total: 1, converted: 0 })
  })
})
