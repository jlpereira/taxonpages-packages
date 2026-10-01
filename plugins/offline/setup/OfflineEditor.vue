<template>
  <div class="space-y-5">
    <!-- Settings -->
    <div class="tp-card p-5 sm:p-6 space-y-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-base-content">Settings</h3>
          <p class="text-sm text-base-soft mt-1">
            When enabled, the site reads its data from the local database
            instead of {{ status?.config.source || 'the TaxonWorks API' }}.
            Rebuild the site after changing this.
          </p>
        </div>
        <button
          class="tp-btn tp-btn-primary tp-btn-sm shrink-0"
          :disabled="!hasUnsavedChanges(fileName)"
          @click="save"
        >
          Save
        </button>
      </div>

      <label class="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          class="tp-checkbox"
          :checked="settings.enabled === true"
          @change="set('enabled', $event.target.checked)"
        />
        <span class="font-medium">Use the local database</span>
      </label>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block text-sm">
          <span class="font-medium">When a request is not in the database</span>
          <select
            class="tp-select mt-1.5 w-full"
            :value="settings.mode || 'strict'"
            @change="set('mode', $event.target.value)"
          >
            <option value="strict">
              Answer "not available" (fully offline)
            </option>
            <option value="proxy">
              Fetch it from TaxonWorks (cache proxy)
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="font-medium">Database file</span>
          <input
            class="tp-input mt-1.5 w-full"
            :value="settings.database || ''"
            placeholder=".taxonpages/offline/offline.db"
            @input="set('database', $event.target.value || undefined)"
          />
        </label>
      </div>

      <div class="space-y-2.5">
        <label
          v-if="settings.mode === 'proxy'"
          class="flex items-center gap-2.5 text-sm"
        >
          <input
            type="checkbox"
            class="tp-checkbox"
            :checked="settings.proxy_store !== false"
            @change="set('proxy_store', $event.target.checked)"
          />
          <span>Keep what the proxy fetches in the database</span>
        </label>

        <label class="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            class="tp-checkbox"
            :checked="settings.log_misses === true"
            @change="set('log_misses', $event.target.checked)"
          />
          <span>
            Record requests the database could not answer
            <span class="text-base-soft">(to a file, listed below)</span>
          </span>
        </label>

        <label class="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            class="tp-checkbox"
            :checked="settings.media !== false"
            @change="set('media', $event.target.checked)"
          />
          <span>
            Download images and sounds
            <span class="text-base-soft"
              >(only the sizes the site displays)</span
            >
          </span>
        </label>
      </div>

      <div
        v-if="settings.media !== false"
        class="space-y-2"
      >
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="block text-sm">
            <span class="font-medium">Full-size images</span>
            <select
              class="tp-select mt-1.5 w-full"
              :value="images.format || 'original'"
              @change="setImages('format', $event.target.value)"
            >
              <option value="original">Keep as downloaded</option>
              <option value="webp">Convert to WebP</option>
              <option value="jpeg">Convert to JPEG</option>
              <option value="avif">
                Convert to AVIF (smallest, much slower)
              </option>
            </select>
          </label>

          <template v-if="images.format && images.format !== 'original'">
            <label class="block text-sm">
              <span class="font-medium">Quality (1–100)</span>
              <input
                type="number"
                min="1"
                max="100"
                class="tp-input mt-1.5 w-full"
                :value="images.quality ?? 80"
                @input="
                  setImages('quality', Number($event.target.value) || undefined)
                "
              />
            </label>

            <label class="block text-sm">
              <span class="font-medium">Longest side, in pixels</span>
              <input
                type="number"
                min="0"
                class="tp-input mt-1.5 w-full"
                :value="images.max_size || ''"
                placeholder="Keep the size"
                @input="
                  setImages(
                    'max_size',
                    Number($event.target.value) || undefined
                  )
                "
              />
            </label>
          </template>
        </div>
        <p
          v-if="images.format === 'avif' && !images.max_size"
          class="text-xs text-warning"
        >
          AVIF at full size can take about a minute per full-size image. Set a
          longest side (2048 takes about 10 seconds), or use WebP, which takes
          under a second.
        </p>
        <p
          v-if="images.format && images.format !== 'original'"
          class="text-xs text-base-soft"
        >
          Applies to images downloaded from now on. To convert the ones already
          in the database, run <code>taxonpages offline:images</code>.
        </p>
      </div>
    </div>

    <!-- Scope -->
    <div class="tp-card p-5 sm:p-6 space-y-4">
      <div>
        <h3 class="font-semibold text-base-content">What to include</h3>
        <p class="text-sm text-base-soft mt-1">
          All taxa, or only those under some OTUs. Add geographic areas to keep
          only the OTUs recorded in them; with OTUs chosen too, only those
          within both.
        </p>
      </div>

      <h4 class="text-sm font-medium">Taxa</h4>
      <div class="flex gap-5 text-sm">
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="offline-scope"
            :checked="!roots.length && scope === 'project'"
            @change="setScope('project')"
          />
          All taxa
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="offline-scope"
            :checked="roots.length > 0 || scope === 'subtree'"
            @change="setScope('subtree')"
          />
          Under these OTUs
        </label>
      </div>

      <div
        v-if="roots.length || scope === 'subtree'"
        class="space-y-3"
      >
        <ul
          v-if="roots.length"
          class="space-y-1.5"
        >
          <li
            v-for="id in roots"
            :key="id"
            class="flex items-center justify-between gap-3 rounded-lg bg-base-muted px-3 py-2 text-sm"
          >
            <span>
              {{ labels[id] || `OTU ${id}` }}
              <span class="text-base-soft">· #{{ id }}</span>
            </span>
            <button
              class="tp-btn tp-btn-ghost tp-btn-sm"
              @click="removeRoot(id)"
            >
              Remove
            </button>
          </li>
        </ul>

        <div class="relative">
          <input
            v-model="term"
            class="tp-input w-full"
            placeholder="Search a taxon name, or type an OTU id"
            @input="search"
          />
          <ul
            v-if="results.length"
            class="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-base-border bg-base-foreground shadow-lg"
          >
            <li
              v-for="item in results"
              :key="item.id"
            >
              <button
                class="w-full text-left px-3 py-2 text-sm hover:bg-base-muted"
                @click="addRoot(item)"
              >
                {{ item.label }}
                <span class="text-base-soft">· #{{ item.id }}</span>
              </button>
            </li>
          </ul>
          <p
            v-if="searchError"
            class="text-sm text-danger mt-1.5"
          >
            {{ searchError }}
          </p>
        </div>
      </div>

      <div class="space-y-3 pt-2 border-t border-base-border">
        <h4 class="text-sm font-medium pt-3">Geographic areas</h4>

        <ul
          v-if="areas.length"
          class="space-y-1.5"
        >
          <li
            v-for="id in areas"
            :key="id"
            class="flex items-center justify-between gap-3 rounded-lg bg-base-muted px-3 py-2 text-sm"
          >
            <span
              >Geographic area
              <span class="text-base-soft">#{{ id }}</span></span
            >
            <button
              class="tp-btn tp-btn-ghost tp-btn-sm"
              @click="removeArea(id)"
            >
              Remove
            </button>
          </li>
        </ul>

        <form
          class="flex gap-2"
          @submit.prevent="addArea"
        >
          <input
            v-model="areaInput"
            class="tp-input flex-1"
            inputmode="numeric"
            placeholder="Geographic area id, from TaxonWorks"
          />
          <button
            class="tp-btn tp-btn-outline tp-btn-sm"
            :disabled="!/^\d+$/.test(areaInput.trim())"
          >
            Add
          </button>
        </form>

        <label
          v-if="areas.length"
          class="block text-sm"
        >
          <span class="font-medium">Match</span>
          <select
            class="tp-select mt-1.5 w-full"
            :value="settings.geo_mode || 'descendants'"
            @change="set('geo_mode', $event.target.value)"
          >
            <option value="descendants">
              The areas and the areas inside them (a country and its states)
            </option>
            <option value="exact">Only the areas themselves</option>
            <option value="spatial">
              Anything georeferenced within the areas' shapes
            </option>
          </select>
        </label>

        <div
          v-if="areas.length"
          class="text-sm rounded-lg bg-base-muted px-3 py-2"
        >
          <template v-if="preview.loading">Counting matching OTUs…</template>
          <span
            v-else-if="preview.error"
            class="text-danger"
          >
            {{ preview.error }}
          </span>
          <template v-else-if="preview.total !== null">
            <span class="font-medium">{{ preview.total }} OTUs</span> match
            <span
              v-if="preview.sample.length"
              class="text-base-soft"
            >
              — {{ preview.sample.map((o) => o.label).join('; ')
              }}{{ preview.total > preview.sample.length ? '…' : '' }}
            </span>
          </template>
        </div>
      </div>

      <label
        class="flex items-start gap-2.5 text-sm pt-2 border-t border-base-border"
      >
        <input
          type="checkbox"
          class="tp-checkbox mt-3.5"
          :checked="settings.include_ancestors === true"
          @change="set('include_ancestors', $event.target.checked)"
        />
        <span class="pt-3">
          Include ancestors
          <span class="block text-base-soft">
            The pages of the higher taxa in each breadcrumb. They show the
            ancestor's data as TaxonWorks has it, including taxa outside the
            scope.
          </span>
        </span>
      </label>
    </div>

    <!-- What to store -->
    <div class="tp-card p-5 sm:p-6 space-y-4">
      <div>
        <h3 class="font-semibold text-base-content">What to store</h3>
        <p class="text-sm text-base-soft mt-1">
          What is left out is not synced. On the site it shows as not available
          (strict mode), or is fetched from TaxonWorks (proxy mode). Sizes are
          what the database holds for each now.
        </p>
      </div>

      <p
        v-if="datasetsError"
        class="text-sm text-danger"
      >
        {{ datasetsError }}
      </p>

      <div
        v-for="group in datasetGroups"
        :key="group.id"
        class="space-y-2"
      >
        <h4 class="text-sm font-medium">{{ group.label }}</h4>
        <label
          v-for="dataset in group.datasets"
          :key="dataset.id"
          class="flex items-start gap-2.5 text-sm"
        >
          <input
            type="checkbox"
            class="tp-checkbox mt-0.5"
            :checked="isIncluded(dataset)"
            :disabled="
              dataset.required ||
              (dataset.group === 'media' && settings.media === false)
            "
            @change="setInclude(dataset, $event.target.checked)"
          />
          <span class="flex-1">
            <span class="font-medium">{{ dataset.label }}</span>
            <span
              v-if="dataset.source"
              class="text-base-soft"
            >
              ({{ dataset.source }})</span
            >
            <span class="block text-xs text-base-soft">{{
              dataset.description
            }}</span>
          </span>
          <span
            v-if="dataset.size"
            class="text-xs text-base-soft whitespace-nowrap"
          >
            {{ dataset.size.items }} · {{ formatBytes(dataset.size.bytes) }}
          </span>
        </label>
      </div>

      <div
        v-if="stats"
        class="flex flex-wrap items-center gap-2 pt-1"
      >
        <button
          class="tp-btn tp-btn-outline tp-btn-sm"
          :disabled="!canSync"
          title="Fetch what the database does not hold yet, such as datasets just included, without syncing the rest again"
          @click="start(false, true)"
        >
          Add what is missing
        </button>
        <button
          class="tp-btn tp-btn-outline tp-btn-sm"
          :disabled="!canSync || pruning || !prunable"
          title="Delete what the database holds for the datasets left out"
          @click="prune"
        >
          {{ pruning ? 'Deleting…' : 'Delete what is left out' }}
        </button>
        <span
          v-if="pruneMessage"
          class="text-xs text-base-soft"
        >
          {{ pruneMessage }}
        </span>
      </div>
    </div>

    <!-- Sync speed -->
    <div class="tp-card p-5 sm:p-6 space-y-4">
      <div>
        <h3 class="font-semibold text-base-content">Sync speed</h3>
        <p class="text-sm text-base-soft mt-1">
          How fast the sync asks TaxonWorks for data. TaxonWorks serves other
          people while the sync runs: a faster sync puts more load on it.
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label
          v-for="option in PACING_OPTIONS"
          :key="option.value"
          class="flex items-start gap-2.5 rounded-lg border p-3 text-sm cursor-pointer"
          :class="
            pacing === option.value
              ? 'border-secondary-color bg-secondary-light'
              : 'border-base-border'
          "
        >
          <input
            type="radio"
            name="offline-pacing"
            class="mt-0.5"
            :checked="pacing === option.value"
            @change="setSync('pacing', option.value)"
          />
          <span>
            <span class="font-medium">{{ option.label }}</span>
            <span class="block text-xs text-base-soft mt-0.5">{{
              option.description
            }}</span>
          </span>
        </label>
      </div>

      <div
        v-if="pacing === 'adaptive'"
        class="grid gap-4 sm:grid-cols-2"
      >
        <label class="block text-sm">
          <span class="font-medium">Requests at a time</span>
          <select
            class="tp-select mt-1.5 w-full"
            :value="parallelRequests"
            @change="setSync('parallel_requests', Number($event.target.value))"
          >
            <option
              v-for="choice in parallelChoices"
              :key="choice.value"
              :value="choice.value"
            >
              {{ choice.label }}
            </option>
          </select>
          <span class="block text-xs text-base-soft mt-1">
            The next request is sent as soon as one is answered, so the sync
            goes as fast as TaxonWorks answers, and slows down on its own when
            it is busy.
          </span>
        </label>

        <label class="block text-sm">
          <span class="font-medium">At most, requests per second</span>
          <input
            type="number"
            min="0"
            class="tp-input mt-1.5 w-full"
            :value="sync.max_requests_per_second ?? ''"
            :placeholder="String(defaultCeiling)"
            @input="
              setSync(
                'max_requests_per_second',
                numberOrDefault($event.target.value)
              )
            "
          />
          <span class="block text-xs text-base-soft mt-1">
            A safety limit, for a site close to the TaxonWorks server, where
            answers come so quickly that a few at a time can still be many per
            second. 0 for no limit. Empty, it follows the requests at a time:
            2.5 per second for each.
          </span>
        </label>
      </div>

      <label
        v-else
        class="block text-sm sm:w-1/2"
      >
        <span class="font-medium">Requests per second</span>
        <input
          type="number"
          min="1"
          class="tp-input mt-1.5 w-full"
          :value="sync.requests_per_second ?? ''"
          :placeholder="String(DEFAULT_SYNC.requests_per_second)"
          @input="
            setSync('requests_per_second', numberOrDefault($event.target.value))
          "
        />
        <span class="block text-xs text-base-soft mt-1">
          The same number every second, however long TaxonWorks takes to answer.
        </span>
      </label>

      <div
        v-if="settings.media !== false"
        class="grid gap-4 sm:grid-cols-2"
      >
        <label class="block text-sm">
          <span class="font-medium"
            >Images and sounds downloaded at a time</span
          >
          <input
            type="number"
            min="1"
            class="tp-input mt-1.5 w-full"
            :value="sync.parallel_downloads ?? ''"
            :placeholder="String(DEFAULT_SYNC.parallel_downloads)"
            @input="
              setSync(
                'parallel_downloads',
                numberOrDefault($event.target.value)
              )
            "
          />
        </label>

        <label
          v-if="pacing === 'fixed'"
          class="block text-sm"
        >
          <span class="font-medium">Downloads per second</span>
          <input
            type="number"
            min="1"
            class="tp-input mt-1.5 w-full"
            :value="sync.downloads_per_second ?? ''"
            :placeholder="String(DEFAULT_SYNC.downloads_per_second)"
            @input="
              setSync(
                'downloads_per_second',
                numberOrDefault($event.target.value)
              )
            "
          />
        </label>
      </div>
    </div>

    <!-- Database and sync -->
    <div class="tp-card p-5 sm:p-6 space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-base-content">Database</h3>
          <p class="text-sm text-base-soft mt-1">
            {{ status?.config.database }}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <template v-if="running">
            <button
              class="tp-btn tp-btn-outline tp-btn-sm"
              @click="stop"
            >
              Stop
            </button>
          </template>
          <template v-else>
            <button
              class="tp-btn tp-btn-outline tp-btn-sm"
              :disabled="!canSync"
              title="Discard the progress of an interrupted run and start over"
              @click="start(true)"
            >
              Start over
            </button>
            <button
              class="tp-btn tp-btn-primary tp-btn-sm"
              :disabled="!canSync"
              @click="start(false)"
            >
              {{ resumable ? 'Resume sync' : 'Sync now' }}
            </button>
          </template>
        </div>
      </div>

      <p
        v-if="hasUnsavedChanges(fileName)"
        class="text-sm text-warning"
      >
        Save the settings first: the sync reads them from the file.
      </p>
      <p
        v-else-if="status && !status.config.source"
        class="text-sm text-warning"
      >
        Set the API URL and project token in API Connection first.
      </p>

      <div
        v-if="progress"
        class="space-y-2"
      >
        <div class="flex justify-between text-sm">
          <span class="font-medium">{{ phaseLabel }}</span>
          <span class="text-base-soft">
            {{ progress.done + progress.skipped }} /
            {{ progress.queued || '?' }} OTUs · {{ progress.requests }} requests
            · {{ progress.media }} media ·
            {{ formatDuration(progress.elapsed) }}
            <template v-if="progress.failed">
              · <span class="text-danger">{{ progress.failed }} failed</span>
            </template>
          </span>
        </div>
        <div class="h-2 rounded-full bg-base-muted overflow-hidden">
          <div
            class="h-full bg-secondary-color transition-all duration-300"
            :style="{ width: `${percent}%` }"
          />
        </div>
      </div>

      <p
        v-if="status?.sync.error"
        class="text-sm text-danger"
      >
        {{ status.sync.error }}
      </p>

      <dl
        v-if="stats"
        class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"
      >
        <div
          v-for="item in statItems"
          :key="item.label"
          class="rounded-lg bg-base-muted px-3 py-2"
        >
          <dt class="text-base-soft text-xs">{{ item.label }}</dt>
          <dd class="font-semibold mt-0.5">{{ item.value }}</dd>
        </div>
      </dl>
      <p
        v-else
        class="text-sm text-base-soft"
      >
        No database yet.
      </p>

      <div
        v-if="hasData || wipeMessage"
        class="flex flex-wrap items-center gap-3"
      >
        <button
          v-if="hasData"
          class="tp-btn tp-btn-danger tp-btn-sm"
          :disabled="running || wiping"
          title="Delete everything synced, the database contents and the media files, to start from nothing"
          @click="wipe"
        >
          {{ wiping ? 'Deleting…' : 'Delete database and media' }}
        </button>
        <span
          v-if="wipeMessage"
          class="text-xs text-base-soft"
        >
          {{ wipeMessage }}
        </span>
      </div>

      <details
        v-if="log.length"
        class="text-xs"
      >
        <summary class="cursor-pointer text-base-soft">Sync log</summary>
        <pre
          class="mt-2 max-h-48 overflow-auto rounded-lg bg-base-muted p-3 whitespace-pre-wrap"
          >{{ log.join('\n') }}</pre
        >
      </details>
    </div>

    <!-- Misses -->
    <div class="tp-card p-5 sm:p-6 space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-base-content">
            Requests not in the database
          </h3>
          <p class="text-sm text-base-soft mt-1">
            <template v-if="settings.log_misses">
              Recorded while the site runs. Browse the site, then check here for
              what the sync does not cover.
            </template>
            <template v-else>
              Turn on "Record requests the database could not answer" to fill
              this list.
            </template>
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            class="tp-btn tp-btn-ghost tp-btn-sm"
            @click="loadMisses"
          >
            Refresh
          </button>
          <button
            class="tp-btn tp-btn-ghost tp-btn-sm"
            :disabled="!misses.length"
            @click="clearMisses"
          >
            Clear
          </button>
        </div>
      </div>

      <table
        v-if="misses.length"
        class="w-full text-sm"
      >
        <thead>
          <tr class="text-left text-base-soft text-xs">
            <th class="font-medium pb-2">Request</th>
            <th class="font-medium pb-2 w-24">Result</th>
            <th class="font-medium pb-2 w-16 text-right">Times</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="miss in misses"
            :key="miss.key"
            class="border-t border-base-border"
          >
            <td class="py-1.5 pr-3 text-xs break-all">
              <span class="font-mono">{{ readable(miss.key) }}</span>
              <span
                v-if="miss.reason"
                class="block text-base-soft"
              >
                {{ miss.reason }}
              </span>
            </td>
            <td class="py-1.5">
              <span
                :class="
                  miss.resolved === 'proxy' ? 'text-warning' : 'text-danger'
                "
              >
                {{ miss.resolved === 'proxy' ? 'Proxied' : 'Missing' }}
              </span>
            </td>
            <td class="py-1.5 text-right">{{ miss.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// This editor runs inside the setup wizard but must not import from it (the
// site build scans it too), so it talks to the plugin's routes directly.
const API = '/api/plugins/offline'
const csrfToken = () =>
  document.querySelector('meta[name="csrf-token"]')?.content

const props = defineProps({
  section: { type: Object, required: true },
  configData: { type: Object, required: true },
  setConfigValue: { type: Function, required: true },
  saveConfig: { type: Function, required: true },
  hasUnsavedChanges: { type: Function, required: true }
})

const fileName = computed(() => props.section.file)
const configKey = computed(() => props.section.configKey || 'offline')
const settings = computed(
  () => props.configData[fileName.value]?.[configKey.value] || {}
)
const roots = computed(() =>
  Array.isArray(settings.value.roots) ? settings.value.roots : []
)
const images = computed(() => settings.value.images || {})
const sync = computed(() => settings.value.sync || {})
const areas = computed(() =>
  Array.isArray(settings.value.geographic_areas)
    ? settings.value.geographic_areas
    : []
)

const status = ref(null)
const progress = ref(null)
const running = ref(false)
const log = ref([])
const misses = ref([])
const datasets = ref([])
const datasetsError = ref('')
const pruning = ref(false)
const pruneMessage = ref('')
const wiping = ref(false)
const wipeMessage = ref('')
const scope = ref('project')
const term = ref('')
const results = ref([])
const searchError = ref('')
const labels = ref({})
const areaInput = ref('')
const preview = ref({ loading: false, error: '', total: null, sample: [] })

let events = null
let searchTimer = null
let previewTimer = null

const stats = computed(() => status.value?.database?.stats || null)
const run = computed(() => status.value?.database?.run || null)
const hasData = computed(() =>
  Boolean(stats.value && (stats.value.responses || stats.value.media))
)
const resumable = computed(() => Boolean(run.value && !run.value.completedAt))
const canSync = computed(
  () =>
    !running.value &&
    !props.hasUnsavedChanges(fileName.value) &&
    Boolean(status.value?.config.source)
)

const percent = computed(() => {
  const p = progress.value
  if (!p?.queued) return p?.phase === 'completed' ? 100 : 0
  return Math.min(
    100,
    Math.round(((p.done + p.skipped + p.failed) / p.queued) * 100)
  )
})

const phaseLabel = computed(
  () =>
    ({
      starting: 'Starting…',
      project: 'Syncing project data (OTU list, sources, news)…',
      otus: 'Syncing OTU pages…',
      media: 'Downloading images and sounds…',
      completed: 'Completed',
      interrupted: 'Stopped — resume to continue'
    })[progress.value?.phase] || progress.value?.phase
)

const statItems = computed(() => {
  const s = stats.value
  return [
    {
      label: 'OTUs synced',
      value: `${s.syncedOtus}${s.failedOtus ? ` (${s.failedOtus} failed)` : ''}`
    },
    { label: 'Stored responses', value: s.responses },
    {
      label: 'Media files',
      value: `${s.media} · ${formatBytes(s.mediaBytes)}`
    },
    { label: 'Database size', value: formatBytes(s.databaseBytes) },
    ...(run.value?.elapsedMs
      ? [
          {
            label: run.value.completedAt
              ? 'Last sync took'
              : 'Sync time so far',
            value: formatDuration(run.value.elapsedMs)
          }
        ]
      : [])
  ]
})

function set(key, value) {
  const next = { ...settings.value }
  if (value === undefined) delete next[key]
  else next[key] = value
  props.setConfigValue(fileName.value, configKey.value, next)
}

function setImages(key, value) {
  const next = { ...images.value }
  if (value === undefined) delete next[key]
  else next[key] = value
  set('images', Object.keys(next).length ? next : undefined)
}

// As config.js resolves `offline.sync`; the editor cannot import it.
// `max_requests_per_second` has no fixed default: see `defaultCeiling`.
const DEFAULT_SYNC = {
  pacing: 'adaptive',
  parallel_requests: 8,
  requests_per_second: 8,
  parallel_downloads: 4,
  downloads_per_second: 8
}

const PACING_OPTIONS = [
  {
    value: 'adaptive',
    label: 'Adaptive (recommended)',
    description:
      'A few requests at a time, as fast as TaxonWorks answers them. Slows down on its own when TaxonWorks is busy.'
  },
  {
    value: 'fixed',
    label: 'Fixed rate',
    description:
      'The same number of requests every second. The load is always the same, but slower: most of the time is spent waiting for the next turn.'
  }
]

const PARALLEL_CHOICES = [
  { value: 2, label: '2 — slowest' },
  { value: 4, label: '4 — slow' },
  { value: 8, label: '8 — recommended' },
  { value: 16, label: '16 — fast' },
  { value: 32, label: '32 — very fast' },
  { value: 64, label: '64 — fastest' }
]

const pacing = computed(() =>
  sync.value.pacing === 'fixed' ? 'fixed' : DEFAULT_SYNC.pacing
)

const parallelRequests = computed(() => {
  const n = Number(sync.value.parallel_requests)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SYNC.parallel_requests
})

/** The ceiling when none is set, as config.js resolves it. */
const defaultCeiling = computed(() => parallelRequests.value * 2.5)

/** The choices, plus a value set by hand in offline.yml. */
const parallelChoices = computed(() =>
  PARALLEL_CHOICES.some((choice) => choice.value === parallelRequests.value)
    ? PARALLEL_CHOICES
    : [
        ...PARALLEL_CHOICES,
        {
          value: parallelRequests.value,
          label: `${parallelRequests.value} — set in offline.yml`
        }
      ]
)

/** Defaults are left out of the file, so it only says what was changed. */
function setSync(key, value) {
  const next = { ...sync.value }
  if (value === undefined || value === DEFAULT_SYNC[key]) delete next[key]
  else next[key] = value
  set('sync', Object.keys(next).length ? next : undefined)
}

/** A number typed in a field; empty (or not a number) for the default. */
function numberOrDefault(text) {
  const n = Number(text)
  return text === '' || !Number.isFinite(n) || n < 0 ? undefined : n
}

async function save() {
  await props.saveConfig(fileName.value)
  await Promise.all([loadStatus(), loadDatasets()])
}

const DATASET_GROUPS = [
  ['core', 'Pages'],
  ['panels', 'Panels'],
  ['map', 'Map'],
  ['project', 'Project'],
  ['media', 'Images and sounds'],
  ['packages', 'From packages']
]

const datasetGroups = computed(() =>
  DATASET_GROUPS.map(([id, label]) => ({
    id,
    label,
    datasets: datasets.value.filter((dataset) => dataset.group === id)
  })).filter((group) => group.datasets.length)
)

/** As the edited (maybe unsaved) settings say, the way datasets.js decides. */
function isIncluded(dataset) {
  if (dataset.required) return true
  if (dataset.group === 'media' && settings.value.media === false) return false
  return settings.value.include?.[dataset.id] ?? dataset.default
}

function setInclude(dataset, value) {
  const next = { ...(settings.value.include || {}) }
  if (value === dataset.default) delete next[dataset.id]
  else next[dataset.id] = value
  set('include', Object.keys(next).length ? next : undefined)
}

/** Something left out in the saved settings still has data to delete. */
const prunable = computed(() =>
  datasets.value.some((dataset) => !dataset.included && dataset.size)
)

async function loadDatasets() {
  try {
    const res = await fetch(`${API}/datasets`)
    const data = await res.json()
    if (!res.ok)
      throw new Error(data.error || 'Could not list what the sync stores')
    datasets.value = data.datasets
    datasetsError.value = ''
  } catch (err) {
    datasetsError.value = err.message
  }
}

async function prune() {
  pruning.value = true
  pruneMessage.value = ''
  try {
    const result = await post('/prune')
    pruneMessage.value = `Deleted ${result.responses} responses and ${result.files} files.`
    await Promise.all([loadStatus(), loadDatasets()])
  } catch (err) {
    pruneMessage.value = err.message
  } finally {
    pruning.value = false
  }
}

async function wipe() {
  const size = formatBytes(
    (stats.value?.databaseBytes || 0) + (stats.value?.mediaBytes || 0)
  )
  if (
    !confirm(
      `Delete the database and the media files (${size})? Everything will have to be synced again.`
    )
  )
    return

  wiping.value = true
  wipeMessage.value = ''
  try {
    await post('/wipe')
    wipeMessage.value = 'Database and media deleted.'
    await Promise.all([loadStatus(), loadDatasets()])
  } catch (err) {
    wipeMessage.value = err.message
  } finally {
    wiping.value = false
  }
}

function setScope(value) {
  scope.value = value
  if (value === 'project') set('roots', [])
}

function addRoot(item) {
  labels.value[item.id] = item.label
  set('roots', [...new Set([...roots.value, item.id])])
  term.value = ''
  results.value = []
}

function removeRoot(id) {
  set(
    'roots',
    roots.value.filter((r) => r !== id)
  )
}

function addArea() {
  const id = Number(areaInput.value.trim())
  if (!Number.isInteger(id) || id <= 0) return

  set('geographic_areas', [...new Set([...areas.value, id])])
  areaInput.value = ''
}

function removeArea(id) {
  set(
    'geographic_areas',
    areas.value.filter((a) => a !== id)
  )
}

/** Count what the (unsaved) area scope matches, to check the ids. */
function loadPreview() {
  clearTimeout(previewTimer)

  if (!areas.value.length) {
    preview.value = { loading: false, error: '', total: null, sample: [] }
    return
  }

  preview.value = { ...preview.value, loading: true, error: '' }

  previewTimer = setTimeout(async () => {
    const query = new URLSearchParams({
      areas: areas.value.join(','),
      roots: roots.value.join(','),
      geo_mode: settings.value.geo_mode || 'descendants'
    })

    try {
      const res = await fetch(`${API}/scope/preview?${query}`)
      const data = await res.json()
      if (!res.ok)
        throw new Error(data.error || 'Could not count the matching OTUs')
      preview.value = {
        loading: false,
        error: '',
        total: data.total,
        sample: data.sample
      }
    } catch (err) {
      preview.value = {
        loading: false,
        error: err.message,
        total: null,
        sample: []
      }
    }
  }, 400)
}

watch(
  () => [areas.value.join(), roots.value.join(), settings.value.geo_mode],
  loadPreview
)

function search() {
  clearTimeout(searchTimer)
  searchError.value = ''

  if (!term.value.trim()) {
    results.value = []
    return
  }

  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(
        `${API}/otus/search?term=${encodeURIComponent(term.value.trim())}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      results.value = data
    } catch (err) {
      results.value = []
      searchError.value = err.message
    }
  }, 300)
}

async function post(path, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken()
    },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

async function start(fresh, missing = false) {
  try {
    log.value = []
    pruneMessage.value = ''
    wipeMessage.value = ''
    await post('/sync', { fresh, missing })
    running.value = true
  } catch (err) {
    status.value = {
      ...status.value,
      sync: { ...status.value.sync, error: err.message }
    }
  }
}

async function stop() {
  await post('/sync/stop').catch(() => {})
}

async function loadStatus() {
  const res = await fetch(`${API}/status`)
  status.value = await res.json()
  running.value = status.value.sync.running
  progress.value =
    status.value.sync.progress || status.value.database?.progress || null
  log.value = status.value.sync.log || []
}

async function loadMisses() {
  const res = await fetch(`${API}/misses`)
  misses.value = (await res.json()).misses || []
}

async function clearMisses() {
  await post('/misses/clear')
  await loadMisses()
}

function listen() {
  events = new EventSource(`${API}/sync/events`)
  events.onmessage = (message) => {
    const event = JSON.parse(message.data)

    if (event.type === 'progress') {
      progress.value = event.progress
      running.value = true
    } else if (event.type === 'log') {
      log.value = [...log.value.slice(-199), event.line]
    } else if (event.type === 'finished') {
      running.value = false
      loadStatus()
      loadDatasets()
    }
  }
}

function readable(key) {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

/** Names for roots saved in an earlier session, looked up by id. */
async function loadRootLabels() {
  await Promise.all(
    roots.value
      .filter((id) => !labels.value[id])
      .map(async (id) => {
        try {
          const res = await fetch(`${API}/otus/search?term=${id}`)
          const [found] = res.ok ? await res.json() : []
          if (found) labels.value[id] = found.label
        } catch {
          // The id stays as the label
        }
      })
  )
}

/** 2h 03m 09s, 3m 09s, 9s */
function formatDuration(ms = 0) {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')

  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`
  if (m) return `${m}m ${pad(s)}s`
  return `${s}s`
}

function formatBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}

onMounted(async () => {
  if (roots.value.length) scope.value = 'subtree'
  await Promise.all([loadStatus(), loadMisses(), loadDatasets()])
  listen()
  loadRootLabels()
  loadPreview()
})

onBeforeUnmount(() => {
  events?.close()
  clearTimeout(searchTimer)
  clearTimeout(previewTimer)
})
</script>
