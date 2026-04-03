# PaneliNaturalist

A TaxonPages panel that displays iNaturalist observations for a given taxon. It fetches real-time data from the [iNaturalist API](https://api.inaturalist.org/v1/) and presents observation photos in a responsive grid with pagination and an integrated image viewer.

**Panel ID:** `panel:inaturalist`
**Supported rank groups by default:** `GenusGroup`, `SpeciesGroup`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-inaturalist
```

### Manual

Copy the `PaneliNaturalist/` folder into your project's `panels/` directory:

```
panels/
  PaneliNaturalist/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:inaturalist
```

## Configuration

Configure the panel via the TaxonPages setup editor or directly in `taxa_page.yml` using `bind`:

```yaml
taxa_page:
  overview:
    panels:
      - - - id: panel:inaturalist
            bind:
              title: 'iNaturalist Records'
              iconicTaxa:
                - Insecta
              qualityGrade: research
              thumbnailSize: medium
              perPage: 30
              columnsMobile: auto
              columnsDesktop: auto
              showImageCount: true
```

### Important: Iconic Taxa

It is **strongly recommended** to set the `iconicTaxa` option to match your project's taxonomic group. The iNaturalist API matches observations by taxon name, and different organisms can share the same name across taxonomic groups. Without this filter, the panel may display observations from unrelated taxa (e.g., a plant genus that shares a name with an insect genus).

```yaml
bind:
  iconicTaxa:
    - Insecta
```

### Options

| Option           | Type    | Default          | Description                                                                                                                                                                                                                                                             |
| ---------------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iconicTaxa`     | Array   | `[]`             | Filter by taxonomic group. **Recommended** — without it, results may include unrelated observations. Options: `Actinopterygii`, `Amphibia`, `Animalia`, `Arachnida`, `Aves`, `Chromista`, `Fungi`, `Insecta`, `Mammalia`, `Mollusca`, `Plantae`, `Protozoa`, `Reptilia` |
| `title`          | String  | `"Observations"` | Panel heading text                                                                                                                                                                                                                                                      |
| `perPage`        | Number  | `60`             | Number of observations per page                                                                                                                                                                                                                                         |
| `qualityGrade`   | String  | `"research"`     | Observation quality filter (see below)                                                                                                                                                                                                                                  |
| `thumbnailSize`  | String  | `"small"`        | Image size: `small` (square) or `medium` (3:2 ratio)                                                                                                                                                                                                                    |
| `columnsMobile`  | Number \| String | `"auto"`         | Grid columns on mobile: `auto` or `1`–`6`. `auto` fills as many columns as the container width allows, adapting to the selected `thumbnailSize`                                                                                                                         |
| `columnsDesktop` | Number \| String | `"auto"`         | Grid columns on desktop: `auto` or `1`–`12`. `auto` fills as many columns as the container width allows, adapting to the selected `thumbnailSize`                                                                                                                       |
| `showImageCount` | Boolean | `true`           | Show a `+N` badge when an observation has multiple photos                                                                                                                                                                                                               |
| `parameters`     | Object  | `{}`             | Additional iNaturalist API parameters (advanced, YAML-only)                                                                                                                                                                                                             |

### Quality grades

- **`research`** — Community-verified identification with location and date
- **`needs_id`** — Awaiting community agreement on identification
- **`casual`** — Missing location, date, or flagged as not wild

### Advanced API parameters

The `parameters` option allows passing arbitrary query parameters to the iNaturalist API. This is not available through the setup editor and must be configured in YAML:

```yaml
bind:
  parameters:
    place_id: 6853
    geo: true
    license: cc-by
```

See the [iNaturalist API documentation](https://api.inaturalist.org/v1/docs/#!/Observations/get_observations) for available parameters.

## How it works

1. **Taxon resolution** — The panel reads the taxon name from the `taxon` prop provided by TaxonPages. For subgenus ranks, it resolves the iNaturalist taxon ID by querying both genus and subgenus, validating ancestor relationships.

2. **Fetching observations** — Sends a request to `https://api.inaturalist.org/v1/observations` with the resolved taxon, quality grade, iconic taxa filters, and any custom parameters.

3. **Display** — Observations with photos are rendered in a responsive CSS grid. Each thumbnail is clickable and opens an image viewer to browse all photos of that observation.

4. **Pagination** — Results are paginated according to the `perPage` setting.

## Project structure

```
PaneliNaturalist/
├── main.js                         # Panel entry point and registration
├── PaneliNaturalist.vue            # Main panel component
├── setup.schema.json               # Setup editor configuration schema
├── components/
│   └── ObservationItem.vue         # Individual observation thumbnail
├── constants/
│   ├── gridColumns.js              # Tailwind grid column class mappings
│   ├── imageSize.js                # iNaturalist image size mappings
│   └── observationStyle.js         # Thumbnail aspect ratio and badge styles
└── utils/
    ├── index.js                    # Utils barrel export
    └── makeObservation.js          # API response transformer
```
