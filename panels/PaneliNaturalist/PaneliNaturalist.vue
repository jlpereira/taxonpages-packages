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
        @select="
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
import ObservationItem from './components/ObservationItem.vue'
import { makeObservation } from './utils'
import { COLS_MOBILE, COLS_DESKTOP } from './constants/gridColumns.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Observations'
  },

  iconicTaxa: {
    type: Array,
    default: [],
    validator(value) {
      const allowed = [
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
      return value.every((v) => allowed.includes(v))
    }
  },

  taxon: {
    type: Object,
    required: true
  },

  thumbnailSize: {
    type: String,
    default: 'small',
    validator(value) {
      return ['small', 'medium'].includes(value)
    }
  },

  perPage: {
    type: Number,
    default: 60
  },

  qualityGrade: {
    type: String,
    default: 'research',
    validator(value) {
      return ['research', 'casual', 'needs_id'].includes(value)
    }
  },

  showImageCount: {
    type: Boolean,
    default: true
  },

  columnsMobile: {
    type: [Number, String],
    default: 'auto'
  },

  columnsDesktop: {
    type: [Number, String],
    default: 'auto'
  },

  parameters: {
    type: Object,
    default: () => ({})
  }
})

const gridClass = computed(() => {
  const mobileValue = COLS_MOBILE[props.columnsMobile] || COLS_MOBILE[3]
  const desktopValue = COLS_DESKTOP[props.columnsDesktop] || COLS_DESKTOP[6]

  const mobile =
    typeof mobileValue === 'object'
      ? mobileValue[props.thumbnailSize]
      : mobileValue
  const desktop =
    typeof desktopValue === 'object'
      ? desktopValue[props.thumbnailSize]
      : desktopValue

  return `grid ${mobile} ${desktop} gap-2`
})

const isLoading = ref(true)
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
  const [genusData, subgenusData] = await Promise.all([
    fetch(
      `https://api.inaturalist.org/v1/taxa?${new URLSearchParams({ q: genusName, rank: 'genus' })}`
    ).then((r) => r.json()),
    fetch(
      `https://api.inaturalist.org/v1/taxa?${new URLSearchParams({ q: subgenusName, rank: 'subgenus' })}`
    ).then((r) => r.json())
  ])

  const genus = genusData.results.find((t) => t.name === genusName)

  if (!genus) return null

  const subgenus = subgenusData.results.find(
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

  fetch(
    `https://api.inaturalist.org/v1/observations?${new URLSearchParams(observationParams)}`
  )
    .then((response) => response.json())
    .then((data) => {
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
