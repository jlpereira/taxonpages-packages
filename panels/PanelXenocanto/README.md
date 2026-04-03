# PanelXenocanto

A TaxonPages panel that displays [Xeno-canto](https://xeno-canto.org/) audio recordings for a given taxon. It fetches recordings from the Xeno-canto API and presents them in a table with an integrated audio player, sonogram visualization, and pagination.

**Panel ID:** `panel:xeno-canto`
**Supported rank groups by default:** `GenusGroup`, `SpeciesGroup`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-xeno-canto
```

### Manual

Copy the `PanelXenocanto/` folder into your project's `panels/` directory:

```
panels/
  PanelXenocanto/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:xeno-canto
```

## Configuration

Configure the panel via the TaxonPages setup editor or directly in `taxa_page.yml` using `bind`:

```yaml
taxa_page:
  overview:
    panels:
      - - - id: panel:xeno-canto
            bind:
              group: bird
              perPage: 50
```

### Options

| Option    | Type   | Default                                       | Description                                                         |
| --------- | ------ | --------------------------------------------- | ------------------------------------------------------------------- |
| `apiUrl`  | String | `"https://xeno-canto.org/api/3/recordings"`   | Xeno-canto API endpoint                                             |
| `group`   | String | `""`                                          | Filter by animal group: `bird`, `grasshoppers`, or `bats`           |
| `apiKey`  | String | `""`                                          | Optional API key for the Xeno-canto API                             |
| `perPage` | Number | `50`                                          | Number of recordings per page (50–500)                              |

## How it works

1. **Query building** — Constructs a Xeno-canto search query from the taxon name, parsing genus, species, and subspecies. Optionally filters by animal group.

2. **Fetching recordings** — Sends a request to the Xeno-canto API with the query, pagination parameters, and API key if provided.

3. **Display** — Recordings are shown in a table with columns for audio playback, taxon name, country, locality, author, license, and a link to the Xeno-canto page. Selecting a recording opens an audio player with sonogram visualization, playback controls, and recording metadata.

4. **Pagination** — Results are paginated according to the `perPage` setting.

## Project structure

```
PanelXenocanto/
├── main.js                         # Panel entry point and registration
├── PanelXenocanto.vue              # Main panel component
├── setup.schema.json               # Setup editor configuration schema
└── components/
    ├── AudioPlayer.vue             # Audio playback with sonogram display
    ├── AudioProgress.vue           # Interactive seek slider (keyboard accessible)
    ├── AudioTime.vue               # Formatted time display (current / duration)
    ├── ButtonPlay.vue              # Reusable play button
    └── RecordInformation.vue       # Recording metadata display
```
