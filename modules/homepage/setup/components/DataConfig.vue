<template>
  <div>
    <label class="block text-sm font-medium text-base-content mb-3">Data Types</label>
    <p class="text-xs text-base-soft mb-3">Select which statistics to display on the homepage.</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <label
        v-for="(label, key) in DATA_TYPE_LABELS"
        :key="key"
        class="flex items-center gap-2 p-2.5 rounded-lg border border-base-border hover:bg-base-muted/50 cursor-pointer transition-colors"
        :class="{ 'bg-base-muted/30 border-primary-color/30': isTypeEnabled(key) }"
      >
        <input
          type="checkbox"
          class="rounded border-base-border text-primary-color focus:ring-primary-color"
          :checked="isTypeEnabled(key)"
          @change="toggleType(key, $event.target.checked)"
        >
        <span class="text-sm text-base-content">{{ label }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const DATA_TYPE_LABELS = {
  validSpecies: 'Valid species',
  validExtantSpecies: 'Valid extant species',
  taxonNames: 'Scientific names',
  projectSources: 'References',
  citations: 'Citations',
  images: 'Images',
  mediaSounds: 'Sound recordings',
  collectionObjects: 'Specimen records'
}

function isTypeEnabled(key) {
  return props.modelValue.types?.[key] !== false
}

function toggleType(key, checked) {
  const types = { ...(props.modelValue.types || {}), [key]: checked }
  emit('update:modelValue', { ...props.modelValue, types })
}
</script>
