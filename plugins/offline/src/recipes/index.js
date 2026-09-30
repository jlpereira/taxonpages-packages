/**
 * What the plugin knows of the TaxonWorks requests of TaxonPages' own panels,
 * modules and global components: the offline side they do not ship with.
 * Panels and modules of other packages bring theirs in their offline.js.
 *
 * One file per panel (panels/), module (modules/) or component
 * (components/), each exporting by default a recipe shaped as a package's
 * offline.js (see ../sync/recipeShape.js):
 *
 *   panel | module | component   what it is, by the id the site uses
 *   rankGroup                    ranks a panel is limited to (its main.js)
 *   datasets                     what of it a site can leave out
 *   hooks.otu(ctx, binds)        once per OTU page that shows the panel
 *   hooks.project(ctx, core)     once per sync
 *
 * and, only the core's:
 *
 *   serve        answers for endpoints stored responses cannot answer, as
 *                they take queries: { [path]: (query, store) => response }
 *   unavailable  requests the site makes that cannot be synced, and why
 *
 * A recipe mirrors the code of its panel or module: same path, same params,
 * and the same follow-up requests built from the first response. A stored
 * response is only found again if its request is named exactly as the site
 * names it, so when the site changes what it sends, its recipe must change
 * too. Requests the recipes miss are what the miss log is for.
 *
 * `ctx.get(path, params)` performs and stores one request and resolves to the
 * remote response ({ status, data, headers }). It never throws for HTTP
 * errors: a 404 is a legitimate answer the site handles, and is stored too.
 * `binds` are the localized `bind` objects of every place the panel appears
 * in the layout (one per locale, deduplicated). `core` gives the core's
 * project recipes what packages do not get: the store, whether the run only
 * fetches what is missing, and `list(path, params, onPage)` to walk every
 * page of an index.
 */

import biologicalAssociations from './panels/biologicalAssociations.js'
import content from './panels/content.js'
import gallery from './panels/gallery.js'
import keysPanel from './panels/keys.js'
import map from './panels/map.js'
import referencesCited from './panels/referencesCited.js'
import sounds from './panels/sounds.js'
import typeSpecimen from './panels/typeSpecimen.js'

import bibliography from './modules/bibliography.js'
import dwcFilter from './modules/dwcFilter.js'
import imageMatrix from './modules/imageMatrix.js'
import interactiveKeys from './modules/interactiveKeys.js'
import keysModule from './modules/keys.js'
import news from './modules/news.js'
import otus from './modules/otus.js'

import projectStats from './components/projectStats.js'

export { basePage, descendants } from './modules/otus.js'

export const CORE_RECIPES = [
  gallery,
  content,
  typeSpecimen,
  referencesCited,
  map,
  keysPanel,
  sounds,
  biologicalAssociations,

  otus,
  news,
  bibliography,
  dwcFilter,
  imageMatrix,
  keysModule,
  interactiveKeys,

  projectStats
]

/** Endpoints answered from tables, by normalized path. */
const SERVE = Object.assign({}, ...CORE_RECIPES.map((recipe) => recipe.serve || {}))

const UNAVAILABLE = CORE_RECIPES.flatMap((recipe) => recipe.unavailable || [])

/**
 * The core recipes and those of packages together. A package's recipe wins
 * over the core's for the same panel, as a local panel wins over a core panel
 * on the page.
 *
 * Core project recipes are recorded under their first dataset, and marked
 * `core` to be given what only the core's get.
 *
 * @param {import('../sync/packageRecipes.js').PackageRecipes} packageRecipes
 * @returns {import('../sync/packageRecipes.js').PackageRecipes}
 */
export function withCoreRecipes(packageRecipes) {
  const panels = new Map()

  for (const recipe of CORE_RECIPES) {
    if (recipe.panel && recipe.hooks?.otu) {
      panels.set(recipe.panel, { source: 'core', recipe: recipe.hooks.otu, rankGroup: recipe.rankGroup || [] })
    }
  }
  for (const [id, entry] of packageRecipes.panels) panels.set(id, entry)

  const project = CORE_RECIPES.filter((recipe) => recipe.hooks?.project).map((recipe) => ({
    source: 'core',
    core: true,
    dataset: recipe.datasets?.[0]?.id ?? 'page',
    recipe: recipe.hooks.project
  }))

  return {
    ...packageRecipes,
    panels,
    project: [...project, ...packageRecipes.project],
    datasets: [...CORE_RECIPES.flatMap((recipe) => recipe.datasets || []), ...packageRecipes.datasets]
  }
}

/**
 * Answer a request from the tables, when a recipe serves its path.
 *
 * @param {string} path - Normalized API path
 * @param {URLSearchParams} query
 * @param {import('../store.js').OfflineStore} store
 * @returns {{ status: number, headers?: object, data: unknown }|null} Null
 *   when nothing serves it, or its table is empty
 */
export function serve(path, query, store) {
  return SERVE[path]?.(query, store) ?? null
}

/**
 * Why a request cannot be answered offline, when a recipe says.
 *
 * @param {string} key - Request key, as the miss log records it
 * @returns {string|null}
 */
export function unavailableReason(key) {
  let text = key
  try {
    text = decodeURIComponent(key)
  } catch {
    // keep the key as it is
  }

  return UNAVAILABLE.find(({ match }) => match.test(text))?.reason ?? null
}
