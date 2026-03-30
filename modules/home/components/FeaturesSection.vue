<template>
  <section class="py-16 sm:py-24 bg-[var(--tp-base-background)]">
    <div class="container mx-auto px-6">
      <h2 class="text-3xl font-bold text-center text-[var(--tp-base-content)] mb-4">
        Discover & Explore
      </h2>
      <p class="text-center text-[var(--tp-base-content)]/60 mb-12 max-w-xl mx-auto">
        Access comprehensive biodiversity data through our curated tools and resources
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="group bg-[var(--tp-base-foreground)] rounded-xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
        >
          <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--tp-primary)] to-[var(--tp-secondary)] flex items-center justify-center mb-5">
            <component
              :is="feature.icon"
              class="text-[var(--tp-primary-content)]"
            />
          </div>
          <h3 class="text-xl font-semibold text-[var(--tp-base-content)] mb-3">
            {{ feature.title }}
          </h3>
          <p class="text-[var(--tp-base-content)]/60 mb-5 leading-relaxed">
            {{ feature.description }}
          </p>
          <RouterLink
            :to="feature.link"
            class="inline-flex items-center gap-1 text-[var(--tp-primary)] font-medium group-hover:gap-2 transition-all duration-300"
          >
            {{ feature.linkText }}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { h } from 'vue'

const IconSearch = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      class: 'h-6 w-6',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      'stroke-width': 2
    },
    [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
      })
    ]
  )

const IconBook = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      class: 'h-6 w-6',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      'stroke-width': 2
    },
    [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
      })
    ]
  )

const IconNewspaper = () =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      class: 'h-6 w-6',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      'stroke-width': 2
    },
    [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z'
      })
    ]
  )

const features = [
  {
    title: 'Taxonomic Explorer',
    description:
      'Browse and search through detailed taxonomic information including classifications, synonymies, and type specimens.',
    link: '/otus',
    linkText: 'Browse Taxa',
    icon: IconSearch
  },
  {
    title: 'Bibliography',
    description:
      'Access a comprehensive collection of scientific publications, references, and citations related to our taxa.',
    link: '/bibliography',
    linkText: 'View References',
    icon: IconBook
  },
  {
    title: 'News & Updates',
    description:
      'Stay informed with the latest research findings, project updates, and community announcements.',
    link: '/news',
    linkText: 'Read News',
    icon: IconNewspaper
  }
]
</script>
