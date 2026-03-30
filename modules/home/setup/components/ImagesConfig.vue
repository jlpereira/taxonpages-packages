<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-base-content">Carousel Images</label>
      <button
        class="tp-btn tp-btn-outline tp-btn-sm"
        @click="addImage"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Image
      </button>
    </div>

    <div class="space-y-2">
      <div
        v-for="(image, index) in images"
        :key="index"
        class="border border-base-border rounded-lg p-3 bg-base-muted/20 group"
      >
        <div class="flex items-start gap-3">
          <!-- Preview thumbnail -->
          <div class="shrink-0 w-20 h-14 rounded overflow-hidden border border-base-border bg-base-muted">
            <img
              v-if="image.src"
              :src="image.src"
              class="w-full h-full object-cover"
              @error="$event.target.style.display = 'none'"
            >
          </div>

          <!-- Fields -->
          <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="sm:col-span-2">
              <input
                type="text"
                class="tp-input text-sm"
                :value="image.src || ''"
                placeholder="Image URL or path (e.g. images/home/photo.avif)"
                @input="updateImage(index, 'src', $event.target.value)"
              >
            </div>
            <div>
              <input
                type="text"
                class="tp-input text-sm"
                :value="image.label || ''"
                placeholder="Species name"
                @input="updateImage(index, 'label', $event.target.value)"
              >
            </div>
            <div>
              <input
                type="text"
                class="tp-input text-sm"
                :value="image.copyright || ''"
                placeholder="Photographer / copyright"
                @input="updateImage(index, 'copyright', $event.target.value)"
              >
            </div>
            <div>
              <input
                type="text"
                class="tp-input text-sm"
                :value="image.otuId || ''"
                placeholder="OTU ID (links to species page)"
                @input="updateImage(index, 'otuId', toNumberOrEmpty($event.target.value))"
              >
            </div>
          </div>

          <!-- Remove -->
          <button
            class="w-6 h-6 flex items-center justify-center rounded text-base-soft opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white transition-all shrink-0"
            @click="removeImage(index)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <p v-if="!images.length" class="text-sm text-base-soft italic py-3">
      No carousel images configured.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const images = computed(() => props.modelValue)

function addImage() {
  emit('update:modelValue', [...images.value, { src: '', label: '', copyright: '', otuId: '' }])
}

function updateImage(index, key, value) {
  const updated = [...images.value]
  updated[index] = { ...updated[index], [key]: value || undefined }
  emit('update:modelValue', updated)
}

function removeImage(index) {
  emit('update:modelValue', images.value.filter((_, i) => i !== index))
}

function toNumberOrEmpty(val) {
  const n = Number(val)
  return val && !isNaN(n) ? n : undefined
}
</script>
