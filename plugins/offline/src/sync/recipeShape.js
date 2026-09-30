/**
 * The shape of a recipe, as an offline.js exports it by default, and the
 * checks that turn common mistakes into warnings rather than a recipe that
 * silently never runs.
 *
 *   export default {
 *     panel: 'panel:etymology',          // with `hooks.otu`: only where the layout shows it
 *     rankGroup: ['SpeciesGroup'],       // ranks the panel is limited to, as in main.js
 *     datasets: [{ id, label, description, default }],
 *     hooks: {
 *       async otu(ctx, binds) {},        // once per OTU page synced
 *       async project(ctx) {}            // once per sync
 *     }
 *   }
 *
 * or a function, maybe async, that receives the site and returns that:
 *
 *   export default function ({ configuration }) { return { … } }
 */

/** What a recipe can say about itself, besides its hooks. */
export const RECIPE_KEYS = ['panel', 'rankGroup', 'datasets', 'hooks']

/** What only the core's recipes can say (see src/recipes/index.js). */
export const CORE_KEYS = ['module', 'component', 'serve', 'unavailable']

/** When a recipe can run. */
export const HOOKS = ['otu', 'project']

/**
 * The recipe a module exports, resolved: its default export, or what its
 * default export returns when it is a function.
 *
 * @param {object} mod - The imported module
 * @param {object} site - What a recipe function receives
 * @returns {Promise<object|null>} Null when there is no default export
 */
export async function resolveRecipe(mod, site) {
  const definition = mod.default
  if (definition === undefined) return null
  return typeof definition === 'function' ? await definition(site) : definition
}

/**
 * Check a recipe and keep what the sync uses of it. Anything unexpected is
 * reported through `warn`, naming the recipe and suggesting the likely name.
 *
 * @param {unknown} definition
 * @param {object} options
 * @param {string} options.source - Who it comes from, for the warnings
 * @param {boolean} [options.core] - A core recipe, which may say more
 * @param {(message: string) => void} [options.warn]
 * @returns {{ panel: string|null, rankGroup: string[], datasets: object[], hooks: Record<string, Function>, definition: object }|null}
 */
export function normalizeRecipe(definition, { source, core = false, warn = () => {} }) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    warn(`${source}: the default export of offline.js must be an object, or a function returning one`)
    return null
  }

  const allowed = core ? [...RECIPE_KEYS, ...CORE_KEYS] : RECIPE_KEYS
  for (const key of Object.keys(definition)) {
    if (allowed.includes(key)) continue
    const hint = HOOKS.includes(key) ? ` (hooks go under \`hooks\`: hooks: { ${key}() {} })` : suggestion(key, allowed)
    warn(`${source}: unknown \`${key}\` in offline.js${hint}`)
  }

  const hooks = {}
  for (const [name, hook] of Object.entries(definition.hooks || {})) {
    if (!HOOKS.includes(name)) {
      warn(`${source}: unknown hook \`${name}\`${suggestion(name, HOOKS)}`)
    } else if (typeof hook !== 'function') {
      warn(`${source}: hook \`${name}\` is not a function`)
    } else {
      hooks[name] = hook
    }
  }

  const panel = typeof definition.panel === 'string' && definition.panel ? definition.panel : null
  if (definition.panel !== undefined && !panel) warn(`${source}: \`panel\` must be the panel id, as in main.js`)
  if (panel && !hooks.otu) warn(`${source}: \`panel\` is set but there is no \`hooks.otu\` to sync it`)

  const datasets = Array.isArray(definition.datasets)
    ? definition.datasets.filter((dataset) => {
        const valid = typeof dataset?.id === 'string' && dataset.id
        if (!valid) warn(`${source}: every dataset needs an \`id\``)
        return valid
      })
    : []

  return {
    panel,
    rankGroup: Array.isArray(definition.rankGroup) ? definition.rankGroup : [],
    datasets,
    hooks,
    definition
  }
}

/** ` Did you mean \`x\`?` for a name close to one expected, or nothing. */
function suggestion(name, candidates) {
  let best = null
  let bestDistance = Infinity

  for (const candidate of candidates) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase())
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }

  return best && bestDistance <= Math.max(2, Math.floor(best.length / 3)) ? `. Did you mean \`${best}\`?` : ''
}

/** Levenshtein distance. */
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }

  return previous[b.length]
}
