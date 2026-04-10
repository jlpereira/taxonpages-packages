<template>
  <VButton
    size="sm"
    @click="() => (settings.treeView = !settings.treeView)"
    :title="settings.treeView ? 'Switch to List View' : 'Switch to Tree View'"
  >
    <svg
      v-if="settings.treeView"
      xmlns="http://www.w3.org/2000/svg"
      class="size-4"
      viewBox="0 0 24 24"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 19v-2h12v2zm0-6v-2h12v2zm0-6V5h12v2zM5 20q-.825 0-1.412-.587T3 18t.588-1.412T5 16t1.413.588T7 18t-.587 1.413T5 20m0-6q-.825 0-1.412-.587T3 12t.588-1.412T5 10t1.413.588T7 12t-.587 1.413T5 14m0-6q-.825 0-1.412-.587T3 6t.588-1.412T5 4t1.413.588T7 6t-.587 1.413T5 8"
      />
    </svg>
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      class="size-4"
      viewBox="0 0 24 24"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 6h11m-8 6h8m-5 6h5M5 6v.01M8 12v.01M11 18v.01"
      />
    </svg>
  </VButton>
</template>

<script setup>
import useSettingsStore from '../store/settings.js'

const settings = useSettingsStore()
</script>
