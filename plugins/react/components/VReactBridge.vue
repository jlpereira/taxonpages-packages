<template>
  <div ref="containerRef" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, toRaw } from 'vue'
/* import { createElement } from 'react'
import { createRoot } from 'react-dom/client' */

const props = defineProps({
  component: {
    type: [Object, Function],
    required: true
  },

  props: {
    type: Object,
    default: () => ({})
  }
})

const containerRef = ref(null)
let root = null

function renderReact() {
  if (!root) return
  root.render(createElement(toRaw(props.component), toRaw(props.props)))
}

onMounted(() => {
  root = createRoot(containerRef.value)
  renderReact()
})

watch(() => props.props, renderReact, { deep: true })
watch(() => props.component, renderReact)

onBeforeUnmount(() => {
  root?.unmount()
  root = null
})
</script>
