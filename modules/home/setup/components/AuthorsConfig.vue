<template>
  <div>
    <!-- Section title -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-base-content mb-1.5">Section Title</label>
      <input
        type="text"
        class="tp-input"
        :value="modelValue.title || ''"
        placeholder="Authors"
        @input="update('title', $event.target.value || undefined)"
      >
    </div>

    <!-- Author sections (sortable) -->
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-base-content">Author Groups</label>
      <button
        class="tp-btn tp-btn-outline tp-btn-sm"
        @click="addSection"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Group
      </button>
    </div>

    <div class="space-y-3">
      <AuthorSectionCard
        v-for="(section, index) in sections"
        :key="index"
        :model-value="section"
        :index="index"
        :total="sections.length"
        draggable="true"
        @dragstart="onSectionDragStart($event, index)"
        @dragover.prevent="onSectionDragOver($event, index)"
        @dragend="onSectionDragEnd"
        @update:model-value="updateSectionAt(index, $event)"
        @remove="removeSection(index)"
      />
    </div>

    <p v-if="!sections.length" class="text-sm text-base-soft italic py-3">
      No author groups added yet.
    </p>

    <!-- Logo image -->
    <div class="mt-6 mb-4">
      <label class="block text-sm font-medium text-base-content mb-1.5">Logo Image URL</label>
      <input
        type="text"
        class="tp-input"
        :value="modelValue.logoImage || ''"
        placeholder="https://example.com/logo.png"
        @input="update('logoImage', $event.target.value || undefined)"
      >
      <p class="text-xs text-base-soft mt-1">Optional. URL or path to a logo image displayed in the authors section.</p>
    </div>

    <!-- Footer -->
    <div class="mt-4 mb-4">
      <label class="flex items-center gap-2 text-sm font-medium text-base-content mb-1.5">
        <input
          type="checkbox"
          class="tp-checkbox"
          :checked="modelValue.showFooter ?? false"
          @change="update('showFooter', $event.target.checked)"
        >
        Show Footer
      </label>
    </div>

    <div
      v-if="modelValue.showFooter"
      class="mb-4"
    >
      <label class="block text-sm font-medium text-base-content mb-1.5">Footer Text</label>
      <input
        type="text"
        class="tp-input"
        :value="modelValue.footerText || ''"
        placeholder="With the cooperation of..."
        @input="update('footerText', $event.target.value || undefined)"
      >
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import AuthorSectionCard from './AuthorSectionCard.vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const sections = computed(() => props.modelValue.sections || [])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function addSection() {
  const updated = [...sections.value, { title: '', people: [] }]
  emit('update:modelValue', { ...props.modelValue, sections: updated })
}

function updateSectionAt(index, value) {
  const updated = [...sections.value]
  updated[index] = value
  emit('update:modelValue', { ...props.modelValue, sections: updated })
}

function removeSection(index) {
  const updated = sections.value.filter((_, i) => i !== index)
  emit('update:modelValue', { ...props.modelValue, sections: updated })
}

// --- Drag and drop for author sections ---
const dragIndex = ref(null)

function onSectionDragStart(event, index) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function onSectionDragOver(event, index) {
  if (dragIndex.value === null || dragIndex.value === index) return

  const updated = [...sections.value]
  const [moved] = updated.splice(dragIndex.value, 1)
  updated.splice(index, 0, moved)
  dragIndex.value = index

  emit('update:modelValue', { ...props.modelValue, sections: updated })
}

function onSectionDragEnd() {
  dragIndex.value = null
}
</script>
