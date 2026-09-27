import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

// `.mjs` for packages whose package.json does not say "type": "module".
const DEFAULT_FILES = ['offline.js', 'offline.mjs']

/**
 * Recipes shipped by other packages: panels, modules and plugins that request
 * data the core recipes know nothing about.
 *
 * A package opts in with an `offline.js` (or `offline.mjs`) at its root, or at the path named by
 * `taxonpages.offline` in its package.json. Every export is optional:
 *
 *   // The panel id, as main.js declares it. main.js imports .vue files and
 *   // cannot be loaded here, so the id is repeated.
 *   export const panel = 'panel:etymology'
 *
 *   // Ranks the panel is limited to by default, as in main.js.
 *   export const rankGroup = ['SpeciesGroup']
 *
 *   // Once per OTU page. With `panel`, only where the layout shows the panel,
 *   // receiving its localized `bind` values; without, on every OTU page.
 *   export async function otu(ctx, binds) {
 *     await ctx.get('/taxon_name_classifications', { taxon_name_id: ctx.taxonId })
 *   }
 *
 *   // Once per sync, for data outside OTU pages.
 *   export async function project(ctx) {
 *     await ctx.get('/stats')
 *   }
 *
 * Packages are found the way the site finds them (local folders and direct
 * NPM dependencies, minus `packages.disabled`), so only code the site already
 * runs is run here.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string} options.packageRoot - TaxonPages package, for its discovery
 * @param {object} options.configuration
 * @param {{ warn: Function }} [options.logger]
 * @returns {Promise<PackageRecipes>}
 */
export async function loadPackageRecipes({ projectRoot, packageRoot, configuration, logger = console }) {
  const { discoverAllPackages } = await import(
    pathToFileURL(join(packageRoot, 'src/plugins/vite/discoverPackages.js')).href
  )

  const { all } = discoverAllPackages(projectRoot, {
    disabled: configuration.packages?.disabled
  })

  const recipes = { panels: new Map(), everyOtu: [], project: [] }

  for (const descriptor of all) {
    const file = recipeFile(descriptor)
    if (!file) continue

    let mod
    try {
      mod = await import(pathToFileURL(file).href)
    } catch (err) {
      logger.warn(`${descriptor.name}: could not load ${file}: ${err.message}`)
      continue
    }

    const source = descriptor.name

    if (typeof mod.otu === 'function') {
      if (typeof mod.panel === 'string' && mod.panel) {
        recipes.panels.set(mod.panel, {
          source,
          recipe: mod.otu,
          rankGroup: Array.isArray(mod.rankGroup) ? mod.rankGroup : []
        })
      } else {
        recipes.everyOtu.push({ source, recipe: mod.otu })
      }
    }

    if (typeof mod.project === 'function') {
      recipes.project.push({ source, recipe: mod.project })
    }
  }

  return recipes
}

/**
 * @typedef {object} PackageRecipes
 * @property {Map<string, { source: string, recipe: Function, rankGroup: string[] }>} panels
 * @property {Array<{ source: string, recipe: Function }>} everyOtu
 * @property {Array<{ source: string, recipe: Function }>} project
 */

/**
 * The recipe file of a package, or null. A path in the manifest must stay
 * inside the package, as discovery requires of every other manifest path.
 */
function recipeFile(descriptor) {
  let candidates = DEFAULT_FILES

  if (descriptor.source === 'npm') {
    try {
      const manifest = JSON.parse(readFileSync(join(descriptor.path, 'package.json'), 'utf8')).taxonpages
      if (typeof manifest?.offline === 'string') candidates = [manifest.offline]
    } catch {
      return null
    }
  }

  for (const candidate of candidates) {
    const file = resolve(descriptor.path, candidate)
    if (existsSync(file) && isInside(descriptor.path, file)) return file
  }

  return null
}

function isInside(dir, file) {
  const rel = relative(realpathSync(dir), realpathSync(file))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Run a package's recipe, naming the package in any error so a failure is
 * traced to its source.
 */
export async function runPackageRecipe({ source, recipe }, ...args) {
  try {
    await recipe(...args)
  } catch (err) {
    throw new Error(`${source}: ${err.message}`)
  }
}
