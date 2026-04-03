<template>
  <div class="overflow-hidden h-[550px] w-full">
    <img
      v-if="currentImage.src"
      class="object-cover overflow-hidden h-[550px] w-full absolute aspect-video"
      :key="currentImage.src"
      :src="currentImage.src"
      :alt="currentImage.label || ''"
    />
    <div class="bg-black/25 absolute h-full w-full top-0">
      <slot />
    </div>
    <div v-if="currentImage.label" class="absolute bottom-2 right-4">
      <span class="z-10 text-white text-sm drop-shadow">
        <RouterLink
          v-if="currentImage.otuId"
          class="text-white"
          :to="{ name: 'otus-id', params: { id: currentImage.otuId } }"
        >
          <i>{{ currentImage.label }}</i> © {{ currentImage.copyright }}
        </RouterLink>
        <template v-else>
          <i>{{ currentImage.label }}</i>
          <template v-if="currentImage.copyright"> © {{ currentImage.copyright }}</template>
        </template>
      </span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => []
  },
  duration: {
    type: Number,
    default: 5000
  }
})

const currentIndex = ref(null)
const currentImage = computed(() => props.images[currentIndex.value] || {})

onMounted(() => {
  if (props.images.length) {
    currentIndex.value = Math.floor(Math.random() * props.images.length)
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 1s ease-in-out;
}
.fade-enter-from {
  opacity: 0;
}
.fade-enter-to {
  opacity: 1;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
