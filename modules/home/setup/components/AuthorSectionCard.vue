<template>
  <div class="border border-base-border rounded-lg bg-base-muted/20">
    <!-- Section header -->
    <div class="flex items-center gap-3 p-3.5">
      <!-- Drag handle -->
      <span class="text-base-soft/50 cursor-grab active:cursor-grabbing">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </span>

      <input
        type="text"
        class="tp-input flex-1"
        :value="modelValue.title || ''"
        placeholder="Group title (e.g. Editors, Contributors)"
        @input="update('title', $event.target.value)"
      >

      <button
        class="tp-btn tp-btn-danger tp-btn-sm"
        @click="$emit('remove')"
      >
        Remove
      </button>
    </div>

    <!-- People list -->
    <div class="px-3.5 pb-3.5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-base-soft">People</span>
        <button
          class="tp-btn tp-btn-ghost tp-btn-sm"
          @click="addPerson"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Person
        </button>
      </div>

      <div class="space-y-2">
        <PersonCard
          v-for="(person, pIndex) in people"
          :key="pIndex"
          :model-value="person"
          :index="pIndex"
          draggable="true"
          @dragstart.stop="onPersonDragStart($event, pIndex)"
          @dragover.prevent.stop="onPersonDragOver($event, pIndex)"
          @dragend.stop="onPersonDragEnd"
          @update:model-value="updatePerson(pIndex, $event)"
          @remove="removePerson(pIndex)"
        />
      </div>

      <p v-if="!people.length" class="text-xs text-base-soft italic py-2">
        No people added yet.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import PersonCard from './PersonCard.vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  index: { type: Number, required: true },
  total: { type: Number, required: true }
})

const emit = defineEmits(['update:modelValue', 'remove'])

const people = computed(() => props.modelValue.people || [])

function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function addPerson() {
  const updated = [...people.value, { name: '', role: '', location: '', image: '' }]
  emit('update:modelValue', { ...props.modelValue, people: updated })
}

function updatePerson(index, value) {
  const updated = [...people.value]
  updated[index] = value
  emit('update:modelValue', { ...props.modelValue, people: updated })
}

function removePerson(index) {
  const updated = people.value.filter((_, i) => i !== index)
  emit('update:modelValue', { ...props.modelValue, people: updated })
}

// --- Drag and drop for people ---
const dragIndex = ref(null)

function onPersonDragStart(event, index) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.stopPropagation()
}

function onPersonDragOver(event, index) {
  if (dragIndex.value === null || dragIndex.value === index) return

  const updated = [...people.value]
  const [moved] = updated.splice(dragIndex.value, 1)
  updated.splice(index, 0, moved)
  dragIndex.value = index

  emit('update:modelValue', { ...props.modelValue, people: updated })
}

function onPersonDragEnd() {
  dragIndex.value = null
}
</script>
