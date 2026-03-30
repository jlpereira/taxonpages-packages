<template>
  <div>
    <!-- Section order preview -->
    <div class="mb-4">
      <label class="block text-sm font-medium text-base-content mb-2">Section Order</label>
      <p class="text-xs text-base-soft mb-3">Drag sections to reorder. Toggle visibility with the switch.</p>
    </div>

    <!-- Sortable section cards -->
    <div ref="listRef" class="space-y-2 mb-5">
      <SectionCard
        v-for="(key, index) in currentOrder"
        :key="key"
        :section-key="key"
        :label="SECTION_LABELS[key]"
        :description="SECTION_DESCRIPTIONS[key]"
        :enabled="isSectionEnabled(key)"
        :index="index"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="onDragOver($event, index)"
        @dragend="onDragEnd"
        @toggle="toggleSection(key, $event)"
      >
        <template v-if="key === 'hero'">
          <HeroConfig
            :model-value="configValue.hero || {}"
            @update:model-value="updateSection('hero', $event)"
          />
          <hr class="border-base-border my-4">
          <ImagesConfig
            :model-value="heroImages"
            @update:model-value="updateHeroImages($event)"
          />
        </template>
        <DataConfig
          v-if="key === 'data'"
          :model-value="configValue.data || {}"
          @update:model-value="updateSection('data', $event)"
        />
        <DescriptionConfig
          v-if="key === 'description'"
          :model-value="configValue.description || {}"
          @update:model-value="updateSection('description', $event)"
        />
        <AuthorsConfig
          v-if="key === 'authors'"
          :model-value="configValue.authors || {}"
          @update:model-value="updateSection('authors', $event)"
        />
        <TermsConfig
          v-if="key === 'terms'"
          :model-value="configValue.terms || {}"
          @update:model-value="updateSection('terms', $event)"
        />
      </SectionCard>
    </div>

    <!-- Save button -->
    <div class="flex items-center gap-3 mt-5">
      <button
        class="tp-btn tp-btn-primary"
        :disabled="!isFileDirty(fileName)"
        @click="saveConfig(fileName)"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Save Homepage
      </button>
      <span v-if="isFileDirty(fileName)" class="text-xs text-warning font-medium">
        Unsaved changes
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useConfig } from '@setup/composables/useConfig.js'
import SectionCard from './components/SectionCard.vue'
import HeroConfig from './components/HeroConfig.vue'
import DataConfig from './components/DataConfig.vue'
import DescriptionConfig from './components/DescriptionConfig.vue'
import AuthorsConfig from './components/AuthorsConfig.vue'
import TermsConfig from './components/TermsConfig.vue'
import ImagesConfig from './components/ImagesConfig.vue'

const props = defineProps({
  section: { type: Object, required: true }
})

const { configData, setConfigValue, saveConfig, isFileDirty } = useConfig()

const fileName = computed(() => props.section.file)
const configKey = computed(() => props.section.configKey || 'home_module')

const configValue = computed(() => {
  return configData[fileName.value]?.[configKey.value] || {}
})

const DEFAULT_ORDER = ['hero', 'data', 'description', 'authors', 'announcements', 'terms']

const SECTION_LABELS = {
  hero: 'Hero',
  data: 'Project Statistics',
  description: 'Description',
  authors: 'Authors',
  announcements: 'Announcements',
  terms: 'Terms'
}

const SECTION_DESCRIPTIONS = {
  hero: 'Image carousel with hero title, subtitle, and search bar',
  data: 'Statistics counters showing project data (species, citations, images, etc.)',
  description: 'Text paragraphs describing the project',
  authors: 'Contributors and authors grouped by sections',
  announcements: 'Latest news and announcements widget',
  terms: 'Terms of use and citation information'
}

const currentOrder = computed(() => {
  return configValue.value.sectionOrder || [...DEFAULT_ORDER]
})

function isSectionEnabled(key) {
  return configValue.value[key]?.enabled !== false
}

function markDirty(updated) {
  setConfigValue(fileName.value, configKey.value, updated)
}

function updateSection(key, value) {
  const updated = { ...configValue.value, [key]: value }
  markDirty(updated)
}

const heroImages = computed(() => {
  return configValue.value.hero?.images || []
})

function updateHeroImages(images) {
  const hero = { ...(configValue.value.hero || {}), images }
  updateSection('hero', hero)
}

function toggleSection(key, enabled) {
  const sectionData = { ...(configValue.value[key] || {}), enabled }
  updateSection(key, sectionData)
}

// --- Drag and drop for section reorder ---
const dragIndex = ref(null)
const dragOverIndex = ref(null)

function onDragStart(event, index) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event, index) {
  if (dragIndex.value === null || dragIndex.value === index) return
  dragOverIndex.value = index

  const order = [...currentOrder.value]
  const [moved] = order.splice(dragIndex.value, 1)
  order.splice(index, 0, moved)
  dragIndex.value = index

  const updated = { ...configValue.value, sectionOrder: order }
  markDirty(updated)
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}
</script>
