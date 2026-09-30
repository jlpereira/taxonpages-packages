/**
 * Conversion of downloaded images to a smaller format or size
 * (`offline.images`).
 *
 * Full-size images are most of what a sync downloads. They are converted
 * before they are stored, and served with their new content type under the
 * same key, so the site asks for them as before.
 *
 * Needs `sharp`, an optional dependency loaded only when a conversion is
 * configured.
 */

const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', avif: 'image/avif' }

/** Formats sharp reads and that are worth converting: not SVG, not animations. */
const CONVERTIBLE = /^image\/(jpe?g|png|webp|tiff|avif)$/i

/**
 * @param {ReturnType<import('./config.js').resolveOfflineConfig>['images']} settings
 * @returns {Promise<ImageConverter|null>} Null when images are kept as sent
 */
export async function createImageConverter(settings) {
  if (!settings || settings.format === 'original') return null

  const sharp = await loadSharp()
  const fields = new Set(settings.fields)
  const target = MIME[settings.format]

  // Full-size images decode to hundreds of megabytes each, and AVIF encoding
  // needs several times that: converting several at once, with libvips
  // caching operations, runs a sync out of memory. One image at a time
  // loses little, as libvips already spreads each over every core.
  sharp.cache(false)
  const oneAtATime = createLimiter(1)

  /**
   * Whether an image is already what the settings ask for, so converting it
   * again would only lose quality.
   */
  function isDone(metadata) {
    const sameFormat = `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}` === target
    const fits = !settings.maxSize || Math.max(metadata.width, metadata.height) <= settings.maxSize
    return sameFormat && fits
  }

  return {
    settings,

    /** Whether files of a media field are converted. */
    appliesTo(field) {
      return fields.has(field)
    },

    /**
     * Convert an image. Anything that is not a convertible image, or that
     * already matches the settings, comes back unchanged (`converted: false`).
     *
     * @param {Buffer} buffer
     * @param {string} contentType
     * @returns {Promise<{ buffer: Buffer, contentType: string, converted: boolean }>}
     */
    async convert(buffer, contentType) {
      if (!CONVERTIBLE.test(contentType || '')) return { buffer, contentType, converted: false }
      return oneAtATime(() => convertImage(buffer, contentType))
    }
  }

  async function convertImage(buffer, contentType) {
    const unchanged = { buffer, contentType, converted: false }

    const image = sharp(buffer, { failOn: 'none' })
    const metadata = await image.metadata()
    if (isDone(metadata)) return unchanged

    let pipeline = image.rotate() // apply EXIF orientation before it is dropped
    if (settings.maxSize) {
      pipeline = pipeline.resize(settings.maxSize, settings.maxSize, { fit: 'inside', withoutEnlargement: true })
    }

    const { quality } = settings
    pipeline =
      settings.format === 'webp'
        ? pipeline.webp({ quality })
        : settings.format === 'jpeg'
          ? pipeline.jpeg({ quality, mozjpeg: true })
          : pipeline.avif({ quality })

    const output = await pipeline.toBuffer()

    // A small image can come out bigger in another format: keep the smaller.
    if (output.length >= buffer.length && !(settings.maxSize && Math.max(metadata.width, metadata.height) > settings.maxSize)) {
      return unchanged
    }

    return { buffer: output, contentType: target, converted: true }
  }
}

/** Run at most `size` of the functions given at once, the rest in order. */
function createLimiter(size) {
  let active = 0
  const waiting = []

  const next = () => {
    if (active >= size || !waiting.length) return
    active += 1
    const { fn, resolve, reject } = waiting.shift()
    fn()
      .then(resolve, reject)
      .finally(() => {
        active -= 1
        next()
      })
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject })
      next()
    })
}

/**
 * @typedef {object} ImageConverter
 * @property {object} settings
 * @property {(field: string) => boolean} appliesTo
 * @property {(buffer: Buffer, contentType: string) => Promise<{ buffer: Buffer, contentType: string, converted: boolean }>} convert
 */

/** e.g. "webp, quality 80, at most 2048 px" */
export function describeConversion({ format, quality, maxSize }) {
  return [format, `quality ${quality}`, maxSize ? `at most ${maxSize} px` : 'same size'].join(', ')
}

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    throw new Error(
      'Converting images needs the sharp package, which could not be loaded. ' +
        'Install it with `npm install sharp`, or set offline.images.format to "original".'
    )
  }
}
