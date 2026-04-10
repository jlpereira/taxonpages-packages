<template>
  <div
    :class="[
      lead.isFirstLine &&
        lead.parentId == store.lead.id &&
        `before:content-['>>>'] before:text-xs before:-ml-8 before:pr-2 before:w-6 `
    ]"
  >
    <span v-if="lead.isFirstLine">
      <VButton
        :id="`cplt-${lead.beginLabel}`"
        class="scroll-mt-0 tabular-nums"
        size="xs"
        :disabled="currentLead"
        :title="currentLead ? 'Current couplet' : 'Select couplet'"
        @click.prevent="loadParent"
      >
        <span>
          {{ lead.beginLabel }}
        </span>
      </VButton>

      <a
        v-if="backLink"
        :href="`#cplt-${backLink}`"
        @click.prevent="() => moveToLead(backLink)"
      >
        ({{ backLink }})
      </a>
    </span>

    <span
      v-else
      class="border-t border-base-border inline-block relative text-xs top-3 text-transparent mr-1"
      >{{ lead.beginLabel }}</span
    >

    {{ lead.text }}

    <DepictionsModal
      v-if="depictions.length"
      :lead="lead"
      :depictions="depictions"
    />

    <template v-if="lead.linkType === 'otu'">
      ...
      <a
        :href="makeBrowseUrl({ id: lead.targetId })"
        target="_blank"
      >
        {{ lead.targetLabel }}
      </a>
    </template>

    <template v-else-if="lead.linkType === 'couplet'">
      ...
      <a
        :href="`#cplt-${lead.targetLabel}`"
        @click.prevent="() => moveToLead(lead.targetLabel)"
      >
        {{ lead.targetLabel }}
      </a>
    </template>

    <template v-else-if="lead.linkType === 'lead_item_otus'">
      <template v-if="lead.targetId">
        ...&nbsp;
        <a
          :href="makeBrowseUrl({ id: lead.targetId })"
          target="_blank"
        >
          {{ lead.targetLabel }}
        </a>
      </template>

      <ul
        v-if="lead.leadItemOtus.length > 1"
        class="list-none m-0 p-0"
      >
        <li
          v-for="lio in lead.leadItemOtus"
          :key="lio"
        >
          <a
            :href="makeBrowseUrl({ id: lio.id })"
            target="_blank"
          >
            {{ lio.label }}
          </a>
        </li>
      </ul>
      <template v-else>
        ...
        <a
          :href="makeBrowseUrl({ id: lead.leadItemOtus[0].id })"
          target="_blank"
        >
          {{ lead.leadItemOtus[0].label }}
        </a>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import useLeadStore from '../../store/lead.js'
import DepictionsModal from '../DepictionsModal.vue'

const props = defineProps({
  lead: Object,
  backLink: {
    type: [Number, String],
    required: false
  }
})

const store = useLeadStore()

const emit = defineEmits(['scroll:couplet'])

const currentLead = computed(() => props.lead.parentId == store.lead.id)
const depictions = computed(
  () => store.key_data?.[props.lead.id]?.figures || []
)

function loadParent() {
  store.setCurrentLead(props.lead.parentId)
}

function moveToLead(couplet) {
  const leadId = store.key_ordered_parents[couplet - 1]

  emit('scroll:couplet', couplet)
  store.setCurrentLead(leadId)
}

function makeBrowseUrl({ id }) {
  return `/otus/${id}`
}
</script>
