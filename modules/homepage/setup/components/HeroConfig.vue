<template>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-base-content mb-1.5">Title</label>
      <input
        type="text"
        class="tp-input"
        :value="modelValue.title || ''"
        placeholder="Falls back to project name if empty"
        @input="update('title', $event.target.value)"
      >
    </div>
    <div>
      <label class="block text-sm font-medium text-base-content mb-1.5">Subtitle</label>
      <input
        type="text"
        class="tp-input"
        :value="modelValue.subtitle || ''"
        placeholder="Secondary line below the title"
        @input="update('subtitle', $event.target.value)"
      >
    </div>
    <div>
      <label class="block text-sm font-medium text-base-content mb-1.5">Description</label>
      <textarea
        class="tp-input min-h-[80px]"
        :value="modelValue.description || ''"
        placeholder="Optional paragraph below the subtitle"
        @input="update('description', $event.target.value)"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value || undefined })
}
</script>
