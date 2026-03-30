<template>
  <div
    :class="[
      'overflow-hidden relative',
      OBSERVATION_ASPECT_CLASS[thumbnailSize]
    ]"
  >
    <img
      class="cursor-pointer w-full h-full object-cover"
      :alt="altImage"
      :src="observation.observationPhotos[0].photoUrl[thumbnailSize]"
      :title="altImage"
      @click="() => (isViewerVisible = true)"
    />
    <div
      :class="[
        'absolute text-xs text-white bg-black/50 font-medium bottom-0 right-0 rounded-tl-md px-1 py-0.5',
        COUNT_CLASS[thumbnailSize]
      ]"
      v-if="showImageCount && images.length > 1"
    >
      +{{ images.length - 1 }}
    </div>
  </div>
  <ImageViewer
    v-if="isViewerVisible"
    :index="index"
    :images="images"
    :next="index < images.length - 1"
    :previous="index > 0"
    @next="index++"
    @previous="index--"
    @close="() => (isViewerVisible = false)"
    @select-index="(i) => (index = i)"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  OBSERVATION_ASPECT_CLASS,
  COUNT_CLASS
} from '../constants/observationStyle.js'

const props = defineProps({
  observation: {
    type: Object,
    required: true
  },

  showImageCount: {
    type: Boolean,
    default: true
  },

  thumbnailSize: {
    type: String,
    default: 'small'
  }
})

const index = ref(0)
const isViewerVisible = ref(false)

const images = computed(() =>
  props.observation.observationPhotos.map((item) => {
    return {
      ...item,
      thumb: item.photoUrl.small,
      original: item.photoUrl.large
    }
  })
)

const altImage = computed(() => {
  const { attribution } = images.value[0]
  const text = `(iNaturalist observation ${props.observation.id})`

  return [props.observation.taxon, attribution.label, text]
    .filter(Boolean)
    .join(' | ')
})
</script>
