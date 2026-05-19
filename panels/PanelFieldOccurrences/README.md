# PanelFieldOccurrences

A TaxonPages panel that displays field occurrences for a given OTU. It fetches Darwin Core records from the TaxonWorks inventory endpoint and renders each occurrence with locality, coordinates, collector, and associated media — including an integrated image viewer.

**Panel ID:** `panel:field-occurrences`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-field-occurrences
```

### Manual

Copy the `PanelFieldOccurrences/` folder into your project's `panels/` directory:

```
panels/
  PanelFieldOccurrences/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:field-occurrences
```

## How it works

1. **Fetching records** — Requests `/otus/{otuId}/inventory/dwc.json` and keeps only records where `dwc_occurrence_object_type` is `FieldOccurrence`.

2. **Sorting** — Records with `associatedMedia` are moved to the top of the list, so occurrences with images are shown first.

3. **Media resolution** — For each record with `associatedMedia`, the panel splits the pipe-separated URLs and fetches each image extended with `attribution`, `depictions`, and `source` data in parallel.

4. **Label composition** — Each occurrence is summarized as a single line built from:
   - **Count and sex** — `"{individualCount} {sex}"` if `sex` is present, otherwise `"{individualCount} occurrence(s)"`.
   - **Locality** — `country`, `stateProvince`, `county`, and `verbatimLocality` joined with commas.
   - **Coordinates** — `verbatimCoordinates` shown in parentheses.
   - **Collector** — `"Col. {recordedBy}"` when present.

   Example: `2 males; Argentina, Misiones, Iguazú; (-25.6, -54.5); Col. J. Smith`.

5. **Display** — Renders the first `10` records by default. When more exist, a `... Show all ... (N)` toggle reveals the rest. Each record shows its `typeStatus`, the composed label, and a thumbnail gallery for its images.

6. **Image viewer** — Clicking a thumbnail opens a full-screen viewer with next/previous navigation across all images of the selected occurrence.

## Project structure

```
PanelFieldOccurrences/
├── main.js                           # Panel entry point and registration
├── PanelFieldOccurrences.vue         # Main panel component
└── components/
    └── ListOccurrences.vue           # Occurrence list with expand-all toggle and gallery
```
