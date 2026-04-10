<template>
  <VButton
    size="sm"
    @click="toggleLayout"
  >
    <div class="grid grid-cols-2 grid-rows-2 gap-px w-3 h-3 m-0.5">
      <div :class="['bg-base-foreground', panelKeyPreviewClass]" />
      <div :class="['bg-base-foreground', panelRemainingPreviewClass]" />
      <div class="bg-base-foreground" />
    </div>
  </VButton>
</template>

<script setup>
import { computed } from 'vue'
import useSettingStore from '../store/settings.js'

const store = useSettingStore()

const inverseLayout = computed(() =>
  store.layout === 'layout-1' ? 'layout-2' : 'layout-1'
)

const panelKeyPreviewClass = computed(() =>
  inverseLayout.value === 'layout-1' ? 'col-span-2' : 'row-span-2'
)

const panelRemainingPreviewClass = computed(() =>
  inverseLayout.value === 'layout-2' ? 'col-start-2' : ''
)

function toggleLayout() {
  store.layout = inverseLayout.value
}
</script>
