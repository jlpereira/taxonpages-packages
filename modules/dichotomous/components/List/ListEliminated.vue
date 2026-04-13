<template>
  <div class="p-4">
    <h3 class="text-base font-medium">Eliminated ({{ list.length }})</h3>
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
const props = defineProps({
  list: {
    type: Array,
    required: true
  }
})
</script>
