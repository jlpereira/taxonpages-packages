<template>
  <div class="p-4">
    <div class="flex justify-between items-center">
      <h3 class="text-base font-medium">Remaining ({{ list.length }})</h3>
      <ListRemainingOptions :list="list" />
    </div>
    <ul class="text-sm mt-2">
      <li
        v-for="item in list"
        :key="item.id"
      >
        <a
          :href="`/otus/${item.id}`"
          v-html="item.object_tag"
        />
      </li>
    </ul>
  </div>
</template>

<script setup>
import ListRemainingOptions from './ListRemainingOptions.vue'
const props = defineProps({
  list: {
    type: Array,
    required: true
  }
})
</script>
