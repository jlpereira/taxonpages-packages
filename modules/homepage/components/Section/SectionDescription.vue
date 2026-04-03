<template>
  <section
    v-if="paragraphs.length"
    class="bg-base-foreground"
  >
    <div class="container mx-auto px-4 sm:py-10 relative box-border">
      <div class="prose !container dark:prose-invert">
        <div>
          <p
            v-for="(text, index) in paragraphs"
            :key="index"
          >
            {{ text }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const { home_module = {} } = __APP_ENV__
const { description: descriptionConfig = {} } = home_module

const paragraphs = descriptionConfig.paragraphs || []
</script>
