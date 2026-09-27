<template>
  <section>
    <div class="bg-base-foreground">
      <div class="container mx-auto">
        <div
          class="max-h-max grid grid-cols-2 sm:grid-cols-4 grid-col auto-cols-fr xl:grid-flow-col lg:py-18 xl:py-28 py-10 gap-10"
        >
          <DataType
            v-for="(item, key) in dataTypes"
            :key="key"
            class="px-4"
            :icon="item.icon"
            :label="item.label"
            :count="item.count"
          />
        </div>
      </div>
    </div>
    <div class="bg-base-foreground">
      <div class="container mx-auto"></div>
    </div>
  </section>
</template>

<script setup>
import { shallowRef, triggerRef } from 'vue'
import { makeAPIRequest } from '@/utils/request'

import IconAudio from '../../icons/IconAudio.vue'
import IconBug from '../../icons/IconBug.vue'
import IconImage from '../../icons/IconImage.vue'
import IconMicroscope from '../../icons/IconMicroscope.vue'
import IconReference from '../../icons/IconReference.vue'
import IconOk from '../../icons/IconOk.vue'
import IconCitation from '../../icons/IconCitation.vue'

import DataType from './DataType.vue'

const TYPES = {
  validSpecies: 'Valid species',
  validExtantSpecies: 'Valid extant species',
  taxonNames: 'Taxon names',
  projectSources: 'Project sources',
  citations: 'Citations',
  images: 'Images',
  mediaSounds: 'Media sounds',
  collectionObjects: 'Collection objects'
}

const ICONS = {
  validSpecies: IconOk,
  validExtantSpecies: IconOk,
  taxonNames: IconMicroscope,
  projectSources: IconReference,
  citations: IconCitation,
  images: IconImage,
  mediaSounds: IconAudio,
  collectionObjects: IconBug
}

const DEFAULT_LABELS = {
  validSpecies: 'Valid species',
  validExtantSpecies: 'Valid extant species',
  taxonNames: 'Scientific names',
  projectSources: 'References',
  citations: 'Citations',
  images: 'Images',
  mediaSounds: 'Sound recordings',
  collectionObjects: 'Specimen records'
}

const DEFAULT_COUNTS = {
  validSpecies: 29410,
  validExtantSpecies: 28955,
  taxonNames: 47350,
  projectSources: 15500,
  citations: 250000,
  images: 107700,
  mediaSounds: 2030,
  collectionObjects: 108000
}

const { home_module = {} } = __APP_ENV__
const { data: dataConfig = {} } = home_module
const typeToggles = dataConfig.types || {}

const dataTypes = shallowRef(
  Object.keys(TYPES)
    .filter((key) => typeToggles[key] !== false)
    .reduce((acc, key) => {
      acc[TYPES[key]] = {
        icon: ICONS[key],
        label: DEFAULT_LABELS[key],
        count: DEFAULT_COUNTS[key]
      }
      return acc
    }, {})
)

makeAPIRequest('/stats')
  .then((response) => {
    const { data } = response.data

    for (const key in data) {
      if (dataTypes.value[key]) {
        dataTypes.value[key].count = data[key]
      }
    }

    triggerRef(dataTypes)
  })
  .catch(() => {})

async function loadSpeciesCount() {
  const hasValidSpecies = !!dataTypes.value[TYPES.validSpecies]
  const hasValidExtant = !!dataTypes.value[TYPES.validExtantSpecies]

  if (!hasValidSpecies && !hasValidExtant) return

  let totalSpecies = 0

  if (hasValidSpecies || hasValidExtant) {
    const { headers } = await makeAPIRequest('/taxon_names.json', {
      params: {
        page: 1,
        per: 1,
        validity: true,
        rank: ['NomenclaturalRank::Iczn::SpeciesGroup::Species']
      }
    })

    totalSpecies = Number(headers['pagination-total'])

    if (hasValidSpecies) {
      dataTypes.value[TYPES.validSpecies].count = totalSpecies
    }
  }

  if (hasValidExtant) {
    const { headers } = await makeAPIRequest('/taxon_names.json', {
      params: {
        page: 1,
        per: 1,
        taxon_name_id: [913531],
        taxon_name_classification: ['TaxonNameClassification::Iczn::Fossil'],
        validity: true,
        descendants: true,
        nomenclature_group: ['Species'],
        rank: ['NomenclaturalRank::Iczn::SpeciesGroup::Species']
      }
    })

    dataTypes.value[TYPES.validExtantSpecies].count =
      totalSpecies - Number(headers['pagination-total'])
  }

  triggerRef(dataTypes)
}

loadSpeciesCount().catch(() => {})
</script>
