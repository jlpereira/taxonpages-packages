<template>
  <div>
    <img
      class="cursor-pointer"
      :alt="altImage"
      :src="observation.observationPhotos[0].photoUrl.thumb"
      :title="altImage"
      @click="() => (isViewerVisible = true)"
    />
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

const props = defineProps({
  observation: {
    type: Object,
    required: true
  }
})

const index = ref(0)
const isViewerVisible = ref(false)

const altImage = computed(() => {
  const { attribution } = props.observation.observationPhotos[0]
  const text = `(iNaturalist observation ${props.observation.id})`

  return [props.observation.taxon, attribution.label, text]
    .filter(Boolean)
    .join(' | ')
})

const images = computed(() =>
  props.observation.observationPhotos.map((item) => {
    return {
      ...item,
      thumb: item.photoUrl.thumb,
      original: item.photoUrl.large
    }
  })
)
</script>
