<template>
  <div class="inline-block">
    <VButton
      size="xs"
      circle
      variant="transparent"
      title="Click to open image viewer"
      @click="() => (isViewerVisible = true)"
    >
      <IconImage
        v-if="depictions.length"
        class="h-4 text-secondary"
      />
    </VButton>

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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import IconImage from './Icon/IconImage.vue'

const { project_token } = __APP_ENV__

const props = defineProps({
  lead: {
    type: Object,
    required: true
  },
  depictions: {
    type: Array,
    default: () => []
  }
})

const index = ref(0)
const isViewerVisible = ref(false)

function makeOriginalImageUrl(imagePath) {
  return `${url}/${imagePath?.substring(8)}?project_token=${project_token}`
}

const images = computed(() =>
  props.depictions.map((item) => {
    return {
      thumb: item.thumb,
      original: makeOriginalImageUrl(item.original_png),
      depictions: [
        { label: [item.figure_label, item.caption].filter(Boolean).join(' - ') }
      ]
    }
  })
)
</script>
