<template>
  <section class="bg-base-foreground">
    <div class="container mx-auto p-4 sm:py-10 relative box-border">
      <div class="prose !container dark:prose-invert">
        <h2>{{ sectionTitle }}</h2>

        <template
          v-for="(section, index) in sections"
          :key="index"
        >
          <div class="my-4">
            <h3 v-if="section.title">{{ section.title }}</h3>
            <ul>
              <li
                v-for="person in section.people"
                :key="person.name"
              >
                <span class="block">
                  <span class="font-bold">{{ person.name }}</span>
                  <template v-if="person.role"> - {{ person.role }}</template>
                </span>
                <span v-if="person.location">{{ person.location }}</span>
              </li>
            </ul>
          </div>
        </template>

        <div class="my-4">
          <hr class="border-b-base-border" />
          <div class="flex flex-col justify-center items-center">
            <OSFLogo
              class="xl:hidden w-40 text-primary-color right-0 dark:text-base-content"
            />
            <p class="text-center">
              With the cooperation of
              <a
                class="whitespace-nowrap"
                href="https://orthsoc.org/"
                >The Orthopterists' Society</a
              >
            </p>
          </div>
        </div>
      </div>
      <OSFLogo
        class="hidden xl:block opacity-10 w-[40rem] text-primary-color absolute right-0 bottom-56 dark:text-base-content"
      />
    </div>
  </section>
</template>

<script setup>
import OSFLogo from '../OSFLogo.vue'

const { home_module = {} } = __APP_ENV__
const { authors: authorsConfig = {} } = home_module

const sectionTitle = authorsConfig.title || 'Authors'
const sections = authorsConfig.sections || []
</script>
