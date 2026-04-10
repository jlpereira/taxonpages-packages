<template>
  <div>
    <VButton
      size="sm"
      type="button"
      class="button normal-input button-default margin-small-bottom"
      @click="() => (isModalVisible = true)"
    >
      Select
    </VButton>
    <VModal
      v-if="isModalVisible"
      @close="() => (isModalVisible = false)"
      :container-style="{
        width: '500px',
        overflow: 'scroll',
        maxHeight: '80vh'
      }"
    >
      <template #header>
        <h3 class="text-lg font-bold">OTUs</h3>
      </template>

      <div class="px-4 pb-4">
        <ul class="no_bullets py-2">
          <li
            v-for="item in list"
            :key="item.id"
            class="text-sm p-0.5"
          >
            <label class="cursor-pointer">
              <input
                v-model="selectedIds"
                :value="item.id"
                type="checkbox"
              />
              <span
                class="ml-2"
                v-html="item.object_tag"
              />
            </label>
          </li>
        </ul>
      </div>
      <template #footer>
        <div class="flex flex-row gap-2 px-4 pt-4 pb-4">
          <VButton
            v-if="isAllSelected"
            type="button"
            size="sm"
            class="text-xs"
            @click="() => (selectedIds = [])"
          >
            Unselect all
          </VButton>
          <VButton
            v-else
            type="button"
            size="sm"
            class="text-xs"
            @click="() => (selectedIds = [...otuIds])"
          >
            Select all
          </VButton>
          <VButton
            type="button"
            size="sm"
            class="text-xs"
            :disabled="!selectedIds.length"
            @click="openInteractiveKey"
          >
            View interactive key
          </VButton>
          <VButton
            type="button"
            size="sm"
            class="text-xs"
            :disabled="!selectedIds.length"
            @click="openImageViewer"
          >
            View image matrix
          </VButton>
        </div>
      </template>
    </VModal>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  list: {
    type: Array,
    required: true
  }
})

const isModalVisible = ref(false)
const selectedIds = ref([])

const otuIds = computed(() => props.list.map((o) => o.id))

const isAllSelected = computed({
  get: () => otuIds.value.length === selectedIds.value.length
})

function openImageViewer() {
  const ids = selectedIds.value.join('|')

  window.open(`/image_matrices/0?otu_filter=${ids}`, '_self')
}

function openInteractiveKey() {
  const ids = selectedIds.value.join('|')

  window.open(`/interactive_keys/0?otu_filter=${ids}`, '_self')
}
</script>
