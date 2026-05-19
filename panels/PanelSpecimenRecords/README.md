# PanelSpecimenRecords

A TaxonPages panel that displays specimen records for a given OTU. It fetches Darwin Core records from the TaxonWorks inventory endpoint and splits them into two cards — **Type specimens** and **Specimen records** — each with locality, coordinates, depository, collector, and associated media, plus an integrated image viewer.

**Panel ID:** `panel:specimen-records`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-specimen-records
```

### Manual

Copy the `PanelSpecimenRecords/` folder into your project's `panels/` directory:

```
panels/
  PanelSpecimenRecords/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:specimen-records
```

## How it works

1. **Fetching records** — Requests `/otus/{otuId}/inventory/dwc.json` and keeps records where `dwc_occurrence_object_type` is `CollectionObject`.

2. **Splitting** — Records with a `typeStatus` are rendered in the **Type specimens** card; records without one are rendered in the **Specimen records** card. The type-specimens card is hidden entirely when there are no type specimens.

3. **Sorting** — Records with `associatedMedia` are moved to the top of the list, so specimens with images are shown first.

4. **Media resolution** — For each record with `associatedMedia`, the panel splits the pipe-separated URLs and fetches each image extended with `attribution`, `depictions`, and `source` data in parallel.

5. **Label composition** — Each specimen is summarized as a single line built from:
   - **Count and sex** — `"{individualCount} {sex}"` if `sex` is present, otherwise `"{individualCount} specimen(s)"`.
   - **Depository** — `institutionCode`, rendered as a link to `institutionID` when available.
   - **Catalog number** — `catalogNumber` if present.
   - **Locality** — `country`, `stateProvince`, `county`, and `verbatimLocality` joined with commas.
   - **Coordinates** — `verbatimCoordinates` shown in parentheses.
   - **Collector** — `"Col. {recordedBy}"` when present.

   Example: `1 male; MACN; 12345; Argentina, Misiones, Iguazú; (-25.6, -54.5); Col. J. Smith`.

6. **Display** — Each card renders the first `10` records by default. When more exist, a `... Show all ... (N)` toggle reveals the rest. Each record shows its `typeStatus`, the composed label, and a thumbnail gallery for its images.

7. **Image viewer** — Clicking a thumbnail opens a full-screen viewer with next/previous navigation across all images of the selected specimen.

## Project structure

```
PanelSpecimenRecords/
├── main.js                           # Panel entry point and registration
├── PanelSpecimenRecords.vue          # Main panel component
└── components/
    ├── ListSpecimens.vue             # Non-type specimen list with gallery
    └── ListTypeSpecimens.vue         # Type specimen list with gallery
```
