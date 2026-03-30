<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-base-content">Paragraphs</label>
      <button
        class="tp-btn tp-btn-outline tp-btn-sm"
        @click="addParagraph"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Paragraph
      </button>
    </div>

    <div class="space-y-3">
      <div
        v-for="(text, index) in paragraphs"
        :key="index"
        class="group relative"
      >
        <textarea
          class="tp-input min-h-[80px] pr-10"
          :value="text"
          :placeholder="`Paragraph ${index + 1}`"
          @input="updateParagraph(index, $event.target.value)"
        />
        <button
          class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-base-soft opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white transition-all"
          @click="removeParagraph(index)"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="!paragraphs.length" class="text-sm text-base-soft italic py-3">
      No paragraphs added yet.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const paragraphs = computed(() => props.modelValue.paragraphs || [])

function addParagraph() {
  const updated = [...paragraphs.value, '']
  emit('update:modelValue', { ...props.modelValue, paragraphs: updated })
}

function updateParagraph(index, value) {
  const updated = [...paragraphs.value]
  updated[index] = value
  emit('update:modelValue', { ...props.modelValue, paragraphs: updated })
}

function removeParagraph(index) {
  const updated = paragraphs.value.filter((_, i) => i !== index)
  emit('update:modelValue', { ...props.modelValue, paragraphs: updated })
}
</script>
