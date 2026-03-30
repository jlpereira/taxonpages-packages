<template>
  <section>
    <div class="relative box-border">
      <ImageCarrousel :images="images">
        <div
          class="flex flex-col justify-center sm:items-center w-full h-full gap-4 bg-black/25"
        >
          <span class="text-3xl sm:text-4xl px-4 font-medium text-white">{{
            heroTitle
          }}</span>
          <span
            v-if="heroSubtitle"
            class="text-lg sm:text-xl text-white px-4"
          >
            {{ heroSubtitle }}
          </span>
          <p
            v-if="heroDescription"
            class="text-base text-white/90 px-4 max-w-2xl text-center"
          >
            {{ heroDescription }}
          </p>
          <div class="p-3 bg-black/20 w-full max-w-lg box-border rounded-lg">
            <AutocompleteOtu
              autofocus
              class="w-full"
              placeholder="Search by taxon name..."
            />
          </div>
        </div>
      </ImageCarrousel>
    </div>
  </section>
</template>

<script setup>
import ImageCarrousel from '../ImageCarrousel.vue'

const { project_name, home_module = {} } = __APP_ENV__
const { hero = {}, landscape = {} } = home_module

const heroTitle = hero.title || project_name
const heroSubtitle = hero.subtitle || ''
const heroDescription = hero.description || ''
const images = landscape.images || []
</script>
