# @jlpereira/taxonpages-plugin-offline

Serve a [TaxonPages](https://github.com/SpeciesFileGroup/taxonpages) site from a
local SQLite copy of its TaxonWorks data, with no connection to the TaxonWorks
API.

The plugin mounts an API at `/offline/api/v1` that answers the same requests as
TaxonWorks, with the same responses, and points the site at it. The data comes
from a sync you run while online: the whole project, the subtrees under the
OTUs you choose, the OTUs recorded in some geographic areas, or both.

## Requirements

- Node.js 22.13 or later (`node:sqlite`)
- A TaxonPages release after 0.8.2: the plugin relies on relative API URLs
  and the `setupServer()` plugin hook

## Install

```bash
npm install @jlpereira/taxonpages-plugin-offline
```

Or copy this folder into the site as `plugins/offline/`.

Add the database directory to the site's `.gitignore`:

```
.taxonpages/
```

## Use

1. Configure the TaxonWorks API as usual in `config/api.yml`. The sync reads
   from it.
2. Build the database:

   ```bash
   npx taxonpages offline:sync
   ```

3. Turn offline mode on in `config/offline.yml` (below) and start or rebuild
   the site. `dev`, `dev:ssr` and `serve` all work; a static `build` served by
   another web server does not, since the API is served by TaxonPages itself.

All of this can also be done from `taxonpages setup`, under **Plugins → Offline
mode**: settings, choosing subtree roots and geographic areas, running and stopping the sync with
live progress, and the list of requests the database could not answer.

## Configuration

`config/offline.yml`:

```yaml
offline:
  # Serve the site from the local database. Rebuild the site after changing it.
  enabled: false

  # What to do with a request the database cannot answer:
  #   strict  answer 404 (fully offline)
  #   proxy   fetch it from TaxonWorks, when there is a connection
  mode: strict

  # In proxy mode, keep what is fetched so it is there next time.
  proxy_store: true

  # Record requests the database could not answer, to misses.jsonl next to
  # the database.
  log_misses: false

  # What to sync (see "Scope" below). All empty: the whole project.
  roots: []              # OTU ids: their subtrees
  geographic_areas: []   # GeographicArea ids: the OTUs recorded in them
  geo_mode: descendants  # exact | descendants | spatial
  include_ancestors: false

  # Download the images and sounds the site displays.
  media: true

  database: .taxonpages/offline/offline.db

  sync:
    concurrency: 4
    requests_per_second: 8
    retries: 3
```

Changing `mode`, `proxy_store` or `log_misses` takes effect when the server is
restarted.

## Commands

| Command | |
| --- | --- |
| `taxonpages offline:sync` | Build or update the database. `--root <id...>` and `--area <id...>` override `roots` and `geographic_areas`; `--fresh` starts over instead of resuming. |
| `taxonpages offline:status` | What the database holds, and the last run. |
| `taxonpages offline:misses` | Requests the database could not answer. `--clear` empties the log. |

A sync can be interrupted with Ctrl+C and resumed by running it again: OTUs
already done in the run are skipped. A new run starts once the previous one
completed, when the scope changes, or with `--fresh`.

## Scope

| Set | Synced |
| --- | --- |
| nothing | Every OTU in the project |
| `roots` | The OTUs under each root, walking down the taxonomy |
| `geographic_areas` | The OTUs TaxonWorks finds recorded in the areas |
| both | The OTUs recorded in the areas, within the subtrees of the roots |

An OTU is recorded in an area when it has an asserted distribution there, or a
specimen collected there. `geo_mode` sets how an area matches:

- `descendants` (default): the area and the areas inside it, so a country
  includes its states
- `exact`: only the area itself
- `spatial`: anything georeferenced within the area's shape

A geographic scope is a list of OTUs, not a tree: a species recorded in the
area is included, its genus is not. `include_ancestors` adds the ancestors of
every OTU in scope (the taxa of its breadcrumb), with any scope. Their pages
show what TaxonWorks has for them, including children outside the scope. The
pages of OTUs in scope are not filtered either: a species shows its worldwide
distribution and specimens.

The TaxonWorks API has no search for geographic areas, so areas are given by
id, as TaxonWorks shows it. The setup wizard counts the OTUs an area matches,
with a few of their names, as you add it: the way to check an id is right.

## What is synced

For every OTU in scope, the requests its page makes, exactly as the page makes
them: the OTU, its taxon name, catalog and summary, and the requests of every
panel the `taxa_page` layout shows for its rank (gallery, content per locale,
map, type material, citations, keys and their image matrices and dichotomous
keys, sounds and their observations, biological associations with their
images, distributions and citations, descendants).

Project-wide: statistics, news, the bibliography, and the OTU list for search.

Media: thumbnails, full-size images (`original_png`, as the gallery and viewer
request them), key figures and sound files. `medium` images are not
downloaded: the site only shows them in `GalleryMosaic`, in hand-written pages.

Full-size images are by far the largest part of the data. As a reference,
a genus of 72 OTUs took 5.5 minutes and 1,469 requests to sync, and used 26 MB
of database (most of it the project's 17,000-source bibliography) and 175 MB of
media, 172 MB of which were full-size images.

## How responses are stored

Responses are stored as TaxonWorks sent them, found again by the exact request
(path and parameters, in any order, without the project token). Nothing is
rebuilt: labels, catalogs and trees come from TaxonWorks as they are.

Pieces that repeat across responses are stored once and referenced: GeoJSON
coordinates (the same country under thousands of species; the same aggregate
map in `distribution.json`, `distribution.geojson` and `cached_maps/:id`),
long strings, and TaxonWorks records such as the parent OTUs repeated under
every sibling. Everything is Brotli-compressed.

Search endpoints cannot be answered from stored responses, and are answered
from tables instead:

| Endpoint | Difference from TaxonWorks |
| --- | --- |
| `otus/autocomplete` | Ranked by full-text relevance, not TaxonWorks' match tiers |
| `sources` (bibliography) | Same filters; `query_term` and `author` match substrings |
| `news` | Current as of the sync |
| `otus/inventory/alphabetical` | Without DwC filters only (see below) |

## Panels and modules from other packages

The sync only knows what the core panels request. A panel, module or plugin
that requests other data from the TaxonWorks API declares it in an
`offline.js` at its root (`offline.mjs` if its package.json does not say
`"type": "module"`; an NPM package may point elsewhere with
`"taxonpages": { "offline": "./path.js" }`). Every export is optional:

```js
// panels/PanelEtymology/offline.js

// The panel id, as in main.js. main.js imports .vue files and cannot be
// loaded by the sync, so the id is repeated here.
export const panel = 'panel:etymology'

// The ranks the panel is limited to, as in main.js.
export const rankGroup = ['GenusGroup', 'SpeciesGroup', 'SpeciesAndInfraspeciesGroup']

// Once per OTU page where the layout shows the panel, with the panel's
// `bind` values resolved for each locale. Without `panel`, on every OTU page.
export async function otu(ctx, binds) {
  await ctx.get('/taxon_name_classifications', { taxon_name_id: [ctx.taxonId] })
}

// Once per sync, for data outside OTU pages.
export async function project(ctx) {
  await ctx.get('/stats')
}
```

`ctx.get(path, params)` must be called with exactly the path and params the
component passes to `makeAPIRequest.get` — that is the key the response is
found by. It stores the response, downloads the media it refers to, and
resolves to `{ status, data, headers }`, so follow-up requests can be built from
it. It does not throw on HTTP errors: a 404 is stored and answered like any
other response.

`ctx` also carries `otuId`, `taxonId`, `rankString`, `otu` and `taxon` (the
records the page loads), and `once(id, fn)` to run something once per sync
whichever OTU asks for it (a key shared by many OTUs, for instance).

A recipe that throws fails the OTU, with the package named in the error, and
the OTU is retried when the sync is resumed. To check a recipe, turn
`log_misses` on, browse a page with the panel, and look at
`taxonpages offline:misses`.

A recipe can only cover the TaxonWorks API. Panels that call other services
(GBIF, iNaturalist, Xeno-canto) need the network whatever the mode.

## Not available offline

These go to TaxonWorks in proxy mode, and are recorded as misses otherwise:

- Interactive keys (`observation_matrices/:id/key`): TaxonWorks computes them
  for each combination of chosen states.
- The DwC filter with any filter set, and its downloads.
- The map's area search, and the DwC details of a map popup.
- The OTU list of a source in the bibliography.
- Panels from other packages that do not ship an `offline.js` (see above), and
  galleries in hand-written pages.
- OTUs outside the synced subtrees. In strict mode, breadcrumb ancestors
  whose page is not in the database are shown as text rather than links; they
  become links again once their pages are stored (synced, or kept by the
  proxy).

Map tiles and web fonts are not API data and still load from the network.

## Development

```bash
npm install
npm test
```
