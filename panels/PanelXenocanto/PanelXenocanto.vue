<template>
  <VCard>
    <VCardHeader>
      <span>
        xeno-canto
        <span v-if="list.length">({{ list.length }})</span>
      </span>
    </VCardHeader>
    <VCardContent class="min-h-[6rem]">
      <ClientOnly>
        <VSpinner v-if="isLoading" />
      </ClientOnly>

      <div
        v-if="!isLoading && !list.length"
        class="text-xl text-center my-8"
      >
        No records found.
      </div>

      <template v-if="!isLoading && list.length">
        <div
          v-if="currentRecord"
          class="flex flex-col md:flex-row flex-wrap gap-4 justify-start"
        >
          <AudioPlayer :record="currentRecord" />
          <RecordInformation :record="currentRecord" />
        </div>

        <VTable class="my-4 overflow-x-auto">
          <VTableHeader>
            <VTableHeaderRow>
              <VTableHeaderCell class="w-2">Audio</VTableHeaderCell>
              <VTableHeaderCell class="w-2">Taxon</VTableHeaderCell>
              <VTableHeaderCell class="w-12">Country</VTableHeaderCell>
              <VTableHeaderCell>Locality</VTableHeaderCell>
              <VTableHeaderCell>Author</VTableHeaderCell>
              <VTableHeaderCell class="w-24">License</VTableHeaderCell>
              <VTableHeaderCell class="w-2">Page</VTableHeaderCell>
            </VTableHeaderRow>
          </VTableHeader>
          <VTableBody>
            <VTableBodyRow
              v-for="item in pages[currentPage]"
              :key="item.id"
              :class="[
                currentRecord.id === item.id && 'bg-primary-color bg-opacity-20'
              ]"
            >
              <VTableBodyCell>
                <ButtonPlay @click="() => (currentRecord = item)" />
              </VTableBodyCell>
              <VTableBodyCell>{{ getRecordTaxonName(item) }}</VTableBodyCell>
              <VTableBodyCell>{{ item.cnt }}</VTableBodyCell>
              <VTableBodyCell>{{ item.loc }}</VTableBodyCell>
              <VTableBodyCell>{{ item.rec }}</VTableBodyCell>
              <VTableBodyCell>
                <a
                  :href="item.lic"
                  target="_blank"
                  rel="noopener"
                >
                  <img
                    v-if="isCreativeCommons(item.lic)"
                    :src="getCCLicenseFromUrl(item.lic)"
                    alt="Creative Commons license"
                  />
                  <span v-else>{{ item.lic }}</span>
                  <span class="sr-only">(opens in new window)</span>
                </a>
              </VTableBodyCell>
              <VTableBodyCell>
                <a
                  :href="item.url"
                  target="_blank"
                  rel="noopener"
                >
                  Link
                  <span class="sr-only">(opens in new window)</span>
                </a>
              </VTableBodyCell>
            </VTableBodyRow>
          </VTableBody>
        </VTable>
        <VPagination
          :total="list.length"
          :per="MAX_PER_PAGE"
          v-model="currentPage"
        />
      </template>
    </VCardContent>
  </VCard>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import ButtonPlay from './components/ButtonPlay.vue'
import AudioPlayer from './components/AudioPlayer/AudioPlayer.vue'
import RecordInformation from './components/RecordInformation.vue'

const MAX_PER_PAGE = 10

const props = defineProps({
  taxon: {
    type: Object,
    required: true
  },

  apiKey: {
    type: String,
    default: undefined
  },

  group: {
    type: String,
    default: undefined,
    validator(value) {
      return ['bird', 'grasshoppers', 'bats'].includes(value)
    }
  },

  apiUrl: {
    type: String,
    default: 'https://xeno-canto.org/api/3/recordings',
    required: true
  }
})

const currentPage = ref(1)
const currentRecord = ref(null)
const list = ref([])
const isLoading = ref(false)

const pages = computed(() => {
  const tmp = [...list.value]
  const newList = [[]]

  while (tmp.length > 0) {
    newList.push(tmp.splice(0, MAX_PER_PAGE))
  }

  return newList
})

function getRecordTaxonName(record) {
  return [record.gen, record.sp, record.ssp].filter(Boolean).join(' ')
}

function buildQuery(taxon) {
  const name = taxon.expanded_name.replace(/\s*\([^)]+\)/g, '')
  const [genus, species, subspecies] = name.trim().split(/\s+/)

  const parts = [`gen:${genus}`]

  if (species) {
    parts.push(`sp:${species}`)
  }

  if (subspecies) {
    parts.push(`ssp:${subspecies}`)
  }

  if (props.group) {
    parts.push(`grp:${props.group}`)
  }

  return parts.join('+')
}

async function loadRecords(taxon) {
  isLoading.value = true
  list.value = []

  const payload = {
    query: buildQuery(taxon),
    key: props.apiKey
  }

  try {
    const response = await fetch(
      `${props.apiUrl}?${new URLSearchParams(payload)}`
    )
    const data = await response.json()

    list.value = data?.recordings || []
    currentRecord.value = list.value[0]
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadRecords(props.taxon)
})

function makeCCImgUrl(license) {
  return `http://mirrors.creativecommons.org/presskit/buttons/80x15/svg/${license}.svg`
}

function isCreativeCommons(url) {
  return url.includes('creativecommons')
}

function getCCLicenseFromUrl(url) {
  const regex = /licenses\/([a-z-]+)\/\d+\.\d+/
  const match = url.match(regex)

  const [_, license] = match

  return makeCCImgUrl(license)
}
</script>
