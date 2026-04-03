<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-base-content">Content Blocks</label>
      <button
        class="tp-btn tp-btn-outline tp-btn-sm"
        @click="addBlock"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Block
      </button>
    </div>

    <div class="space-y-3">
      <div
        v-for="(block, index) in blocks"
        :key="index"
        class="border border-base-border rounded-lg p-3.5 bg-base-muted/20 group"
      >
        <div class="flex items-start gap-2">
          <div class="flex-1 space-y-2">
            <div>
              <label class="block text-xs font-medium text-base-soft mb-1">Title</label>
              <input
                type="text"
                class="tp-input text-sm"
                :value="block.title || ''"
                placeholder="Block title"
                @input="updateBlock(index, 'title', $event.target.value)"
              >
            </div>
            <div>
              <label class="block text-xs font-medium text-base-soft mb-1">Body (HTML allowed)</label>
              <textarea
                class="tp-input min-h-[80px] text-sm"
                :value="block.body || ''"
                placeholder="Block content — HTML links are supported"
                @input="updateBlock(index, 'body', $event.target.value)"
              />
            </div>
          </div>
          <button
            class="w-6 h-6 flex items-center justify-center rounded text-base-soft opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white transition-all shrink-0"
            @click="removeBlock(index)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <p v-if="!blocks.length" class="text-sm text-base-soft italic py-3">
      No content blocks added yet. A default terms block will be shown.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const blocks = computed(() => props.modelValue.blocks || [])

function addBlock() {
  const updated = [...blocks.value, { title: '', body: '' }]
  emit('update:modelValue', { ...props.modelValue, blocks: updated })
}

function updateBlock(index, key, value) {
  const updated = [...blocks.value]
  updated[index] = { ...updated[index], [key]: value }
  emit('update:modelValue', { ...props.modelValue, blocks: updated })
}

function removeBlock(index) {
  const updated = blocks.value.filter((_, i) => i !== index)
  emit('update:modelValue', { ...props.modelValue, blocks: updated })
}
</script>
