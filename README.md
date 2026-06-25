# TaxonPages Packages

A collection of open-source extensions for [TaxonPages](https://github.com/SpeciesFileGroup/taxonpages) — panels, modules, and plugins that expand a TaxonPages site with additional data sources, page layouts, and runtime capabilities.

**Repository:** [github.com/jlpereira/taxonpages-packages](https://github.com/jlpereira/taxonpages-packages)

## Packages

### Panels

Drop-in cards that render inside a taxon page (`taxa_page.yml`). Each panel is published independently on npm and ships with its own README.

| Package                     | npm                                                                                  | Description                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [PanelEtymology](./panels/PanelEtymology)             | `@jlpereira/taxonpages-panel-etymology`         | Gender, part of speech, and etymology from TaxonWorks Latinized classifications.    |
| [PanelFieldOccurrences](./panels/PanelFieldOccurrences) | `@jlpereira/taxonpages-panel-field-occurrences` | Field occurrences (DwC) with locality, coordinates, collector, and an image viewer. |
| [PanelGBIF](./panels/PanelGBIF)                       | `@jlpereira/taxonpages-panel-gbif`              | Resolves a taxon's GBIF usage key and links to its GBIF taxon page.                 |
| [PaneliNaturalist](./panels/PaneliNaturalist)         | `@jlpereira/taxonpages-panel-inaturalist`       | iNaturalist observations in a responsive grid with an integrated image viewer.      |
| [PanelScrutiny](./panels/PanelScrutiny)               | `@jlpereira/taxonpages-panel-scrutiny`          | Scrutiny entries (TaxonWorks `DataAttribute`s) and their supporting citations.      |
| [PanelSpecimenRecords](./panels/PanelSpecimenRecords) | `@jlpereira/taxonpages-panel-specimen-records`        | Type specimens and other specimen records (DwC) with locality, depository, and images. |
| [PanelXenocanto](./panels/PanelXenocanto)             | `@jlpereira/taxonpages-panel-xeno-canto`        | Xeno-canto audio recordings with sonogram, playback controls, and pagination.       |

### Modules

Page-level extensions that register their own routes and views.

| Package                     | npm                                                  | Description                                                            |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| [dichotomous](./modules/dichotomous) | `@jlpereira/taxonpages-module-dichotomous` | Interactive dichotomous key interface with depictions and list/key views. |
| [homepage](./modules/homepage)       | `@jlpereira/taxonpages-module-homepage`    | OSF-inspired homepage module with configurable sections and editor.    |

### Plugins

Runtime extensions that augment Vue/Vite/TaxonPages itself.

| Package                | npm                                            | Description                                                                  |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| [react](./plugins/react) | `@jlpereira/taxonpages-plugin-react`         | `VReactBridge` component for mounting React components inside Vue templates. |
| [basic-auth](./plugins/basic-auth) | `@jlpereira/taxonpages-plugin-basic-auth` | Protects the whole site with HTTP Basic authentication (browser login dialog). Credentials via `TAXONPAGES_BASIC_AUTH_*` env vars. |

## Installation

Every package can be installed in two ways:

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-<name>
```

TaxonPages will pick up packages automatically through the `taxonpages` field declared in each package's `package.json`.

### Manual

Copy the package folder into the matching directory of your TaxonPages site:

```
your-taxonpages-site/
├── panels/
│   └── PanelEtymology/
├── modules/
│   └── homepage/
└── plugins/
    └── react/
```

Then register the package in the relevant TaxonPages config (`config/taxa_page.yml` for panels, the module's own router entry for modules, etc.). See each package's README for usage examples.

## Repository layout

```
taxonpages-packages/
├── panels/        # Cards rendered inside a taxon page
├── modules/       # Page-level extensions (routes + views)
├── plugins/       # Build-time / runtime plugins
└── server/        # Optional server routes (e.g. Xeno-canto API proxy)
```

The `server/routes/xenocanto.js` route is an optional Node proxy that forwards requests to the Xeno-canto API while injecting the API key from `TAXONPAGES_XENO_CANTO_API_KEY`. Mount it in your TaxonPages server if you'd rather not expose the API key to the browser.

## Development

This repository doubles as a local TaxonPages site for developing and previewing the packages. To run it:

```bash
npm install
npx taxonpages dev
```

Local `config/`, `public/`, and `server/` files are gitignored — bring your own when working on a package locally.

## Contributing

Issues and pull requests are welcome. Each package versions independently; please scope changes to a single package per PR when possible.

## License

MIT
