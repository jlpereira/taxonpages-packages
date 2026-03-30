<template>
  <div class="h-full">
    <template
      v-for="(key, index) in orderedSections"
      :key="key"
    >
      <hr
        v-if="needsDivider(key, index)"
        class="border-base-muted"
      />
      <component
        :is="SECTION_COMPONENTS[key]"
        v-if="SECTION_COMPONENTS[key]"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SectionAuthor from '../components/Section/SectionAuthor.vue'
import SectionData from '../components/Section/SectionData.vue'
import SectionLandscape from '../components/Section/SectionLandscape.vue'
import SectionDescription from '../components/Section/SectionDescription.vue'
import SectionTerms from '../components/Section/SectionTerms.vue'
import SectionAnnouncements from '../components/Section/SectionAnnouncements.vue'

const DEFAULT_ORDER = ['landscape', 'data', 'description', 'authors', 'announcements', 'terms']

const SECTION_COMPONENTS = {
  landscape: SectionLandscape,
  data: SectionData,
  description: SectionDescription,
  authors: SectionAuthor,
  announcements: SectionAnnouncements,
  terms: SectionTerms
}

const DIVIDER_BEFORE = new Set(['description', 'authors', 'announcements', 'terms'])

const { home_module = {} } = __APP_ENV__

const isEnabled = (key) => home_module[key]?.enabled !== false

const orderedSections = computed(() => {
  const order = home_module.sectionOrder || DEFAULT_ORDER
  return order.filter((key) => isEnabled(key) && SECTION_COMPONENTS[key])
})

function needsDivider(key, index) {
  if (index === 0) return false
  return DIVIDER_BEFORE.has(key)
}
</script>
