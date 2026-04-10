<template>
  <div
    ref="treeContainer"
    class="p-4 [&_a]:no-underline"
  >
    <VSpinner
      v-if="loading"
      full-screen
    />

    <KeyCouplet
      v-if="keyTree"
      :node="keyTree"
      @scroll:couplet="scrollToCouplet"
    />
  </div>
</template>

<script setup>
import { computed, useTemplateRef } from 'vue'
import useStore from '../store/lead.js'
import KeyCouplet from './Key/KeyCouplet.vue'

const store = useStore()
const treeContainerRef = useTemplateRef('treeContainer')
const loading = computed(() => store.loading)
const keyTree = computed(() => store.keyTree)

function scrollToCouplet(couplet) {
  const el = treeContainerRef.value.querySelector(`#cplt-${couplet}`)

  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>
