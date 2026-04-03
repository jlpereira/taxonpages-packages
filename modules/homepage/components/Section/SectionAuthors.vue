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

        <div
          v-if="showFooter && footerText"
          class="my-4"
        >
          <hr class="border-b-base-border" />
          <div class="flex flex-col justify-center items-center">
            <img
              v-if="logoImage"
              :src="logoImage"
              class="xl:hidden w-40 right-0"
            />
            <p
              class="text-center"
              v-html="footerText"
            />
          </div>
        </div>
      </div>
      <img
        v-if="logoImage"
        :src="logoImage"
        class="hidden xl:block opacity-10 w-[40rem] absolute right-0 bottom-56"
      />
    </div>
  </section>
</template>

<script setup>
const { home_module = {} } = __APP_ENV__
const { authors: authorsConfig = {} } = home_module

const sectionTitle = authorsConfig.title || 'Authors'
const sections = authorsConfig.sections || []
const footerText = authorsConfig.footerText || ''
const showFooter = authorsConfig.showFooter ?? !!footerText
const logoImage = authorsConfig.logoImage || null
</script>
