<template>
  <div class="bg-base-foreground border border-base-border rounded-md p-3 group">
    <div class="flex items-start gap-2">
      <!-- Drag handle -->
      <span class="text-base-soft/50 cursor-grab active:cursor-grabbing mt-2">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </span>

      <!-- Person fields -->
      <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <input
            type="text"
            class="tp-input text-sm"
            :value="modelValue.name || ''"
            placeholder="Name *"
            @input="update('name', $event.target.value)"
          >
        </div>
        <div>
          <input
            type="text"
            class="tp-input text-sm"
            :value="modelValue.role || ''"
            placeholder="Role"
            @input="update('role', $event.target.value)"
          >
        </div>
        <div>
          <input
            type="text"
            class="tp-input text-sm"
            :value="modelValue.location || ''"
            placeholder="Location / Affiliation"
            @input="update('location', $event.target.value)"
          >
        </div>
        <div class="flex gap-2">
          <input
            type="text"
            class="tp-input text-sm flex-1"
            :value="modelValue.image || ''"
            placeholder="Image URL"
            @input="update('image', $event.target.value)"
          >
          <img
            v-if="modelValue.image"
            :src="modelValue.image"
            class="w-8 h-8 rounded-full object-cover border border-base-border shrink-0"
            @error="$event.target.style.display = 'none'"
          >
        </div>
      </div>

      <!-- Remove button -->
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-base-soft opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white transition-all shrink-0 mt-1"
        @click="$emit('remove')"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  index: { type: Number, required: true }
})

const emit = defineEmits(['update:modelValue', 'remove'])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value || undefined })
}
</script>
