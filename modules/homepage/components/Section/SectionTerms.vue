<template>
  <section v-if="blocks.length" class="bg-base-foreground p-4 py-10">
    <div class="prose !container mx-auto dark:prose-invert">
      <template v-for="(block, index) in blocks" :key="index">
        <h2>{{ block.title }}</h2>
        <p v-html="block.body" />
      </template>
    </div>
  </section>
</template>

<script setup>
const { home_module = {} } = __APP_ENV__
const { terms: termsConfig = {} } = home_module

const blocks = termsConfig.blocks || []
</script>
