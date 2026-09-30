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

  # Datasets to include or leave out, by id (see "What is stored" below).
  include:
    map:dwc: false

  # Convert images before storing them (see "Images" below).
  images:
    format: original   # original | webp | jpeg | avif
    quality: 80        # 1-100
    max_size: 0        # longest side in pixels; 0 keeps the size
    fields: [original_png]

  database: .taxonpages/offline/offline.db

  # How fast the sync asks TaxonWorks for data (see "Sync speed" below).
  sync:
    pacing: adaptive            # adaptive | fixed
    parallel_requests: 8        # adaptive: requests waiting on TaxonWorks at once
    max_requests_per_second: 20 # adaptive: a ceiling; 0 for none
    requests_per_second: 8      # fixed: requests sent every second
    parallel_downloads: 4       # images and sounds downloaded at once
    downloads_per_second: 8     # fixed: downloads started every second
    retries: 3
```

Changing `mode`, `proxy_store` or `log_misses` takes effect when the server is
restarted.

## Commands

| Command | |
| --- | --- |
| `taxonpages offline:sync` | Build or update the database. `--root <id...>` and `--area <id...>` override `roots` and `geographic_areas`; `--fresh` starts over instead of resuming; `--missing` fetches only what the database does not hold yet. |
| `taxonpages offline:status` | What the database holds, and the last run. |
| `taxonpages offline:misses` | Requests the database could not answer, with why when they cannot be synced. `--clear` empties the log. |
| `taxonpages offline:images` | Convert the images already downloaded, as `images` says. |
| `taxonpages offline:prune` | Delete what the database holds for datasets left out in `include`. |

A sync can be interrupted with Ctrl+C and resumed by running it again: OTUs
already done in the run are skipped, and media files not downloaded yet are
downloaded then.

The sync reports how long it took, and `offline:status` and the setup wizard
show it for the last run. A resumed run counts the time of all its sessions. A new run starts once the previous one
completed, when the scope changes, or with `--fresh`.

## Sync speed

A sync makes many requests to TaxonWorks, which other people use at the same
time, so it paces them. `pacing` chooses how:

- `adaptive` (default): a few requests at a time, `parallel_requests`, and
  the next one as soon as one is answered. The sync goes as fast as
  TaxonWorks answers: quick answers free their place quickly, a slow one (a
  large map) holds only its own place, and when TaxonWorks is busy and
  answers slowly the sync slows down with it. `max_requests_per_second`
  caps it, for a site close to the server, where answers come so quickly
  that a few at a time can still be many per second.
- `fixed`: `requests_per_second` requests every second, however long
  TaxonWorks takes to answer. The load is always the same, but most of the
  time is spent waiting for the next turn: most requests take TaxonWorks a
  few milliseconds.

As a reference, the pages of a genus of 26 OTUs (1,141 requests, without
media) took:

| Settings | Time |
| --- | --- |
| `fixed`, 8 per second | 2m 26s |
| `adaptive`, 4 at a time | 2m 01s |
| `adaptive`, 8 at a time, at most 20 per second (the default) | 1m 20s |
| `adaptive`, 8 at a time, no ceiling | 1m 05s |

Lower `parallel_requests` if TaxonWorks answers with errors or becomes slow
for its other users while a sync runs; raise it only on your own TaxonWorks
or with its administrators' consent. Failed requests (busy server, network
errors) are retried `retries` times, waiting longer each time.

Images and sounds are paced apart, so they do not use the API's share:
`parallel_downloads` at a time, and with `fixed`, `downloads_per_second` at
most.

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

## Images

Full-size images (`original_png`, the gallery and the viewer) are nearly all
of the media, and TaxonWorks sends them at full resolution. They can be
converted before they are stored: to another format, to a smaller size, or
both. The site requests them as before and receives the converted file.

Converting needs [sharp](https://sharp.pixelplumbing.com), an optional
dependency installed with the plugin. Images are kept as downloaded unless
`images.format` is set.

As a reference, on 30 full-size images of a real project (2100×1200 JPEGs,
14.6 MB):

| Settings | Size | Time per image |
| --- | --- | --- |
| `webp`, quality 80 | 72% smaller | 200 ms |
| `jpeg`, quality 80 | 66% smaller | 175 ms |
| `webp`, quality 80, `max_size: 2048` | 85% smaller | 120 ms |
| `avif`, quality 50, `max_size: 2048` | 92% smaller | 2.2 s |

Time grows with the size of the image. For a 6000×4000 photo, `avif` at full
size took 56 s, `avif` with `max_size: 2048` 10 s, and `webp` with
`max_size: 2048` under a second. Images are converted one at a time: several
at once run out of memory.

`fields` sets which images are converted, by the response field that refers
to them: `original_png` (gallery and viewer), `original` (carousel and
dichotomous keys), `image` (key figures), `thumb`. Images that already match
the settings, and images that are not photos (SVG), are left as they are.

The settings apply to images downloaded from then on. `taxonpages
offline:images` converts those already in the database; converted files
replace the downloaded ones.

## What is stored

What a sync stores is organized in datasets, each of which can be left out
with `include`:

| Dataset | Default | |
| --- | --- | --- |
| `page` | always | The OTU, its taxon name, catalog, summary and taxonomy |
| `panel:<id>` | included | One per panel of the `taxa_page` layout that requests data |
| `map:dwc` | left out | The Darwin Core table of each map point, and the images it lists: one request per specimen or field occurrence |
| `project:bibliography`, `project:news`, `project:stats` | included | |
| `media:thumb`, `media:original_png`, `media:original`, `media:image`, `media:sound_file` | included | Media, by the field that refers to them; `media: false` leaves them all out |

Packages add their own (see below). What is left out is answered as not
available in strict mode, and fetched from TaxonWorks in proxy mode.

Including a dataset takes effect on the next sync. To add it without syncing
everything again, run `taxonpages offline:sync --missing`: it fetches only
what the database does not hold. Leaving one out stops syncing it; `taxonpages
offline:prune` deletes what the database already holds for it.

Every response and file is recorded under the dataset that asked for it, and
`offline:status` and the setup wizard show the size of each. Data synced
before this was recorded belongs to no dataset until synced again.

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

The sync only knows what TaxonPages' own panels and modules request. A panel,
module or plugin that requests other data from the TaxonWorks API declares
it in an `offline.js` at its root (`offline.mjs` if its package.json does not
say `"type": "module"`; an NPM package may point elsewhere with
`"taxonpages": { "offline": "./path.js" }`), whose default export describes
its recipe. Every key is optional:

```js
// panels/PanelEtymology/offline.js
export default {
  // The panel id, as in main.js. main.js imports .vue files and cannot be
  // loaded by the sync, so the id is repeated here.
  panel: 'panel:etymology',

  // The ranks the panel is limited to, as in main.js.
  rankGroup: ['GenusGroup', 'SpeciesGroup', 'SpeciesAndInfraspeciesGroup'],

  // Parts of what the hooks fetch that a site can leave out with
  // `offline.include`. The hooks ask `ctx.includes(id)`.
  datasets: [
    { id: 'etymology:citations', label: 'Etymology citations', description: '…', default: false }
  ],

  hooks: {
    // Once per OTU page where the layout shows the panel, with the panel's
    // `bind` values resolved for each locale. Without `panel`, on every OTU
    // page.
    async otu(ctx, binds) {
      await ctx.get('/taxon_name_classifications', { taxon_name_id: [ctx.taxonId] })
    },

    // Once per sync, for data outside OTU pages.
    async project(ctx) {
      await ctx.get('/stats')
    }
  }
}
```

The default export can also be a function, maybe async, that receives the
site and returns the recipe, the way a TaxonPages plugin returns its hooks:

```js
// modules/homepage/offline.js
export default function ({ configuration, projectRoot }) {
  const keys = configuration.home?.keys || []

  return {
    hooks: {
      async project(ctx) {
        await Promise.all(keys.map((id) => ctx.get(`/leads/key/${id}.json`)))
      }
    }
  }
}
```

The sync warns about a recipe that would otherwise silently never run: an
`offline.js` without a default export, a hook not under `hooks`, or a hook or
key it does not know (suggesting the likely name).

`ctx.get(path, params)` must be called with exactly the path and params the
component passes to `makeAPIRequest.get` — that is the key the response is
found by. It stores the response, downloads the media it refers to, and
resolves to `{ status, data, headers }`, so follow-up requests can be built from
it. It does not throw on HTTP errors: a 404 is stored and answered like any
other response.

`ctx.get` also takes an absolute URL into the TaxonWorks API, as responses
link to them (DwC `associatedMedia`); `ctx.isApiUrl(url)` tells which are.

`ctx` also carries `otuId`, `taxonId`, `rankString`, `otu` and `taxon` (the
records the page loads), `once(id, fn)` to run something once per sync
whichever OTU asks for it (a key shared by many OTUs, for instance), and
`includes(id)` to ask whether a dataset is included.

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
- The map's area search, and the DwC details of a map popup unless
  `map:dwc` is included.
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

What the plugin knows of TaxonPages' own panels, modules and global
components is in `src/recipes/`, one file each under `panels/`, `modules/`
and `components/`, shaped as a package's `offline.js`. The core's can also
answer endpoints that take queries from the database (`serve`: the
bibliography, news, the OTU search) and say which requests cannot be synced
(`unavailable`, shown with the misses). Only what ships with TaxonPages
belongs there.
