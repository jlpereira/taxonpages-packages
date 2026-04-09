<template>
  <div
    role="slider"
    tabindex="0"
    :aria-label="'Audio progress'"
    :aria-valuemin="0"
    :aria-valuemax="Math.floor(duration)"
    :aria-valuenow="Math.floor(current)"
    :aria-valuetext="`${Math.floor(current)} of ${Math.floor(duration)} seconds`"
    class="h-2 w-full bg-base-background cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    @click="updateProgressBar"
    @keydown="handleKeydown"
  >
    <div
      class="h-full relative bg-primary"
      :style="{ width: progressPorcent + '%' }"
    >
      <div
        class="absolute -right-2 bg-primary h-4 w-4 rounded-full -top-1"
        @mousedown="startDrag"
        @mousemove="handleDrag"
        @mouseup="endDrag"
        @mouseleave="endDrag"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  current: {
    type: Number,
    default: 0
  },

  duration: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update'])

const progressPorcent = computed(() =>
  props.duration > 0 ? Math.floor((props.current / props.duration) * 100) : 0
)

function updateProgressBar(event) {
  const progressBar = event.currentTarget
  const rect = progressBar.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const totalWidth = rect.width
  const progressPercentage = (offsetX / totalWidth) * 100
  const seconds = (progressPercentage / 100) * props.duration

  emit('update', Math.floor(seconds))
}

function handleKeydown(e) {
  const step = 5

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      e.preventDefault()
      emit(
        'update',
        Math.min(Math.floor(props.current + step), Math.floor(props.duration))
      )
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      e.preventDefault()
      emit('update', Math.max(Math.floor(props.current - step), 0))
      break
    case 'Home':
      e.preventDefault()
      emit('update', 0)
      break
    case 'End':
      e.preventDefault()
      emit('update', Math.floor(props.duration))
      break
  }
}
</script>
