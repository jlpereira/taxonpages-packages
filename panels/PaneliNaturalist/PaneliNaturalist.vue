<template>
  <VCard>
    <VCardHeader>{{ title }}</VCardHeader>
    <VCardContent class="min-h-[6rem]">
      <ClientOnly>
        <VSpinner v-if="isLoading" />
      </ClientOnly>

      <div
        v-if="!isLoading && !observations.length"
        class="text-xl text-center my-8 w-full"
      >
        No records found.
      </div>

      <div :class="gridClass">
        <template
          v-for="observation in observations"
          :key="observation.id"
        >
          <ObservationItem
            v-if="observation?.observationPhotos?.length"
            :observation="observation"
            :thumbnail-size="thumbnailSize"
            :show-image-count="showImageCount"
          />
        </template>
      </div>
      <VPagination
        v-if="observations.length"
        class="mt-4"
        v-model="pagination.page"
        :total="pagination.total_results"
        :per="pagination.per_page"
        @update:modelValue="
          (value) => {
            loadObservations({ page: value, per_page: perPage })
          }
        "
      />
    </VCardContent>
  </VCard>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import axios from 'axios'
import ObservationItem from './components/ObservationItem.vue'
import { makeObservation } from './utils'
import { COLS_MOBILE, COLS_DESKTOP } from './constants/gridColumns.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Observations'
  },

  ancestorTaxonId: {
    type: Number,
    default: undefined
  },

  iconicTaxa: {
    type: Array,
    default: [],
    validator() {
      return [
        'Actinopterygii',
        'Amphibia',
        'Animalia',
        'Arachnida',
        'Aves',
        'Chromista',
        'Fungi',
        'Insecta',
        'Mammalia',
        'Mollusca',
        'Plantae',
        'Protozoa',
        'Reptilia'
      ]
    }
  },

  taxon: {
    type: Object,
    required: true
  },

  thumbnailSize: {
    type: String,
    default: 'small',
    validator() {
      return ['small', 'medium']
    }
  },

  perPage: {
    type: Number,
    default: 60
  },

  qualityGrade: {
    type: String,
    default: 'research',
    validator() {
      return ['research', 'casual', 'needs_id']
    }
  },

  showImageCount: {
    type: Boolean,
    default: true
  },

  columnsMobile: {
    type: Number,
    default: 3
  },

  columnsDesktop: {
    type: Number,
    default: 6
  },

  parameters: {
    type: Object,
    default: () => ({})
  }
})

const gridClass = computed(() => {
  const mobile = COLS_MOBILE[props.columnsMobile] || COLS_MOBILE[3]
  const desktop = COLS_DESKTOP[props.columnsDesktop] || COLS_DESKTOP[6]

  return `grid ${mobile} ${desktop} gap-2`
})

const isLoading = ref(false)
const observations = ref([])
const pagination = ref({
  page: 1,
  per_page: props.perPage,
  total_results: 0
})

const iNatTaxonId = ref(null)

const taxonName = computed(() => {
  return props.taxon.expanded_name.replace(/\s*\([^)]+\)/g, '')
})

function parseSubgenus(name) {
  const match = name.match(/^(\S+)\s*\(([^)]+)\)/)

  return match ? { genus: match[1], subgenus: match[2] } : null
}

async function resolveSubgenusId(genusName, subgenusName) {
  const [genusResponse, subgenusResponse] = await Promise.all([
    axios.get('https://api.inaturalist.org/v1/taxa', {
      params: { q: genusName, rank: 'genus' }
    }),
    axios.get('https://api.inaturalist.org/v1/taxa', {
      params: { q: subgenusName, rank: 'subgenus' }
    })
  ])

  const genus = genusResponse.data.results.find((t) => t.name === genusName)

  if (!genus) return null

  const subgenus = subgenusResponse.data.results.find(
    (t) =>
      t.name === subgenusName &&
      t.ancestor_ids.includes(genus.id) &&
      (!props.iconicTaxa.length ||
        props.iconicTaxa.includes(t.iconic_taxon_name))
  )

  return subgenus?.id || null
}

function loadObservations(params = {}) {
  isLoading.value = true

  const observationParams = {
    iconic_taxa: props.iconicTaxa,
    quality_grade: props.qualityGrade,
    hrank: props.taxon.rank,
    ...params,
    ...props.parameters
  }

  if (iNatTaxonId.value) {
    observationParams.taxon_id = [iNatTaxonId.value]
  } else {
    observationParams.taxon_name = taxonName.value
  }

  axios
    .get('https://api.inaturalist.org/v1/observations', {
      params: observationParams
    })
    .then(({ data }) => {
      observations.value = data.results.map(makeObservation)
      pagination.value = {
        page: data.page,
        per_page: data.per_page,
        total_results: data.total_results
      }
    })
    .finally(() => {
      isLoading.value = false
    })
}

onMounted(async () => {
  if (props.taxon.rank === 'subgenus') {
    const parsed = parseSubgenus(props.taxon.expanded_name)

    if (parsed) {
      iNatTaxonId.value = await resolveSubgenusId(parsed.genus, parsed.subgenus)
    }
  }

  loadObservations({ per_page: props.perPage })
})
</script>
