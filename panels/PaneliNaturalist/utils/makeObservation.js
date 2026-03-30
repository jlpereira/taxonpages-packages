import { IMAGE_SIZE } from '../constants/imageSize.js'

function makeImageUrlSizes(url) {
  return Object.fromEntries(
    Object.entries(IMAGE_SIZE).map(([key, iNatSize]) => [
      key,
      url.replace(/square(?=\.)/, iNatSize)
    ])
  )
}

function makeObservationPhoto(item, obs) {
  return {
    photoUrl: makeImageUrlSizes(item.photo.url),
    attribution: { label: item.photo.attribution },
    depictions: obs.taxon.name ? [{ label: obs.taxon.name }] : [],
    source: { label: `<a href="${obs.uri}">${obs.uri}</a>` }
  }
}

export function makeObservation(obs) {
  return {
    id: obs.id,
    taxon: obs.taxon.name,
    observationPhotos:
      obs.observation_photos?.map((p) => makeObservationPhoto(p, obs)) || []
  }
}
