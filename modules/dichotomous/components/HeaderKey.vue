<template>
  <div
    class="flex justify-between items-center bg-base-foreground border-b border-base-border p-4 rounded-t-md gap-2"
  >
    <template v-if="store.root">
      <div>
        <span
          class="text-lg font-medium"
          v-text="store.root.text"
        />
        <template v-if="citations">
          <span> - </span>
          <span
            class="text-sm"
            v-html="sanitizeAndLinkifyHtml(citations)"
          />
        </template>
      </div>
      <div class="flex flex-row gap-2 items-center">
        <ToggleView />

        <ToggleLayout />
        <VButton
          size="sm"
          @click="resetKey"
        >
          Reset
        </VButton>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { sanitizeAndLinkifyHtml } from '@/utils'
import useLeadStore from '../store/lead.js'
import ToggleLayout from './ToggleLayout.vue'
import ToggleView from './ToggleView.vue'

const store = useLeadStore()

const emit = defineEmits(['reset'])

const citations = computed(() =>
  store.root?.citations.map((c) => c.citation_source_body).join('; ')
)

function resetKey() {
  emit('reset')
  if (store.root.id !== store.lead.id) {
    store.setCurrentLead(store.root.id)
  }
}
</script>
