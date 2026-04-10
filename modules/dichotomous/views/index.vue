<template>
  <div
    id="vue-dichotomous-app"
    class="shadow container mx-auto"
  >
    <VSpinner v-if="settings.isLoading" />
    <HeaderKey @reset="scrollPanelKey" />
    <div
      id="dichotomous-container"
      class="grid grid-cols-2 grid-rows-2 gap-px bg-base-border max-h-[calc(100vh-16rem)] h-[calc(100vh-16rem)]"
    >
      <PanelKey
        ref="panelKey"
        :class="['overflow-auto bg-base-foreground', panelKeyClass]"
      />
      <ListRemaining
        :class="['overflow-auto bg-base-foreground', panelRemainingClass]"
        :list="store.remaining"
      />
      <ListEliminated
        class="overflow-auto bg-base-foreground"
        :list="store.eliminated"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import useLeadStore from '../store/lead.js'
import PanelKey from '../components/PanelKey.vue'
import ListEliminated from '../components/List/ListEliminated.vue'
import ListRemaining from '../components/List/ListRemaining.vue'
import HeaderKey from '../components/HeaderKey.vue'
import useSettingsStore from '../store/settings.js'

defineOptions({
  name: 'DichotomousKey'
})

const store = useLeadStore()
const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()

const panelKeyRef = useTemplateRef('panelKey')

const panelKeyClass = computed(() =>
  settings.layout === 'layout-1' ? 'col-span-2' : 'row-span-2'
)

const panelRemainingClass = computed(() =>
  settings.layout === 'layout-2' ? 'col-start-2' : ''
)

function scrollPanelKey() {
  panelKeyRef.value.$el.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(
  () => route.params.id,
  (id) => {
    if (id == null) {
      store.$reset()
      return
    }

    if (String(store.lead?.id) === String(id)) return

    const alreadyLoaded =
      store.key_metadata &&
      (store.key_metadata[id] || store.key_metadata[Number(id)])

    if (alreadyLoaded) {
      store.setCurrentLead(id)
    } else {
      store.loadKey(id)
    }
  },
  { immediate: true }
)
</script>
