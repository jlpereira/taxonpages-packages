<template>
  <div
    class="tp-card transition-shadow"
    :class="{ 'opacity-50': !enabled }"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 p-4 cursor-pointer select-none">
      <!-- Drag handle -->
      <span class="text-base-soft/50 cursor-grab active:cursor-grabbing">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </span>

      <!-- Section info -->
      <div class="flex-1 min-w-0" @click="toggle">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-base-content truncate">{{ label }}</h3>
          <svg
            class="w-4 h-4 text-base-soft transition-transform duration-200 shrink-0"
            :class="{ 'rotate-180': expanded }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <p v-if="description" class="text-xs text-base-soft mt-0.5 truncate">{{ description }}</p>
      </div>

      <!-- Enable toggle -->
      <label class="relative inline-flex items-center cursor-pointer shrink-0" @click.stop>
        <input
          type="checkbox"
          class="sr-only peer"
          :checked="enabled"
          @change="$emit('toggle', $event.target.checked)"
        >
        <div class="w-9 h-5 bg-base-muted rounded-full peer peer-checked:bg-primary-color after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
      </label>
    </div>

    <!-- Collapsible content -->
    <div v-if="expanded && hasContent" class="border-t border-base-border p-5">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, useSlots } from 'vue'

defineProps({
  sectionKey: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  index: { type: Number, required: true }
})

defineEmits(['toggle'])

const slots = useSlots()
const expanded = ref(false)
const hasContent = !!slots.default

function toggle() {
  if (hasContent) {
    expanded.value = !expanded.value
  }
}
</script>
