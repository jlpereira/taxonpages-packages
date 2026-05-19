# PanelScrutiny

A TaxonPages panel that displays scrutiny entries for a given taxon. It fetches `DataAttribute` records of the scrutiny vocabulary term from the TaxonWorks API and renders each entry alongside its supporting citations.

**Panel ID:** `panel:scrutiny`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-scrutiny
```

### Manual

Copy the `PanelScrutiny/` folder into your project's `panels/` directory:

```
panels/
  PanelScrutiny/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:scrutiny
```

## How it works

1. **Fetching scrutinies** — Requests `/data_attributes.json` filtered by `attribute_subject_id` (the taxon ID) and `controlled_vocabulary_term_id` (`3102`, the scrutiny term).

2. **Fetching citations** — For each scrutiny entry, requests `/citations.json` with `citation_object_id` set to the scrutiny's ID and `citation_object_type` set to `DataAttribute`.

3. **Display** — Each scrutiny is rendered as a list item containing its `value` (followed by a period if it doesn't already end with one) and a semicolon-separated list of `citation_source_body` strings from the matching citations.

4. **Visibility** — The card is hidden entirely when no scrutiny entries exist for the taxon.

> **Note:** The scrutiny controlled-vocabulary term ID (`3102`) is hardcoded in `PanelScrutiny.vue`. Update the constant if your TaxonWorks instance uses a different term ID for scrutinies.

## Project structure

```
PanelScrutiny/
├── main.js                # Panel entry point and registration
└── PanelScrutiny.vue      # Main panel component
```
