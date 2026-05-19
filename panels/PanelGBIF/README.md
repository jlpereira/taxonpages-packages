# PanelGBIF

A TaxonPages panel that links a taxon to its [GBIF](https://www.gbif.org/) taxon page. It resolves the taxon's GBIF usage key through the GBIF species-match API and renders a direct link to the matching record.

**Panel ID:** `panel:gbif`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-gbif
```

### Manual

Copy the `PanelGBIF/` folder into your project's `panels/` directory:

```
panels/
  PanelGBIF/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:gbif
```

## How it works

1. **Name matching** — Sends the taxon's `expanded_name` to `https://api.gbif.org/v1/species/match` and reads the `usageKey` from the response.

2. **Link composition** — When a `usageKey` is returned, the panel renders a card pointing to `https://www.gbif.org/species/{usageKey}`, with the taxon's `full_name_tag` as the link label and the GBIF logo as the card header.

3. **Visibility** — The card is hidden entirely when GBIF does not return a `usageKey` for the taxon.

## Project structure

```
PanelGBIF/
├── main.js                # Panel entry point and registration
└── PanelGBIF.vue          # Main panel component
```
