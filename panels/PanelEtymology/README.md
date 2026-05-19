# PanelEtymology

A TaxonPages panel that displays gender, part of speech, and etymology information for a given taxon. It pulls Latinized classifications from the TaxonWorks API and renders the taxon's etymology with Markdown support.

**Panel ID:** `panel:etymology`
**Supported rank groups by default:** `GenusGroup`, `SpeciesGroup`, `SpeciesAndInfraspeciesGroup`

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-panel-etymology
```

### Manual

Copy the `PanelEtymology/` folder into your project's `panels/` directory:

```
panels/
  PanelEtymology/
```

### Usage

Add the panel to your `config/taxa_page.yml`:

```yaml
taxa_page:
  overview:
    panels:
      - - - panel:etymology
```

## How it works

1. **Fetching classifications** — Requests `/taxon_name_classifications` filtered by `taxon_name_id` and keeps only those of type `TaxonNameClassification::Latinized::*` (gender and part of speech).

2. **Human-readable labels** — Maps each classification type to a readable label and joins them as a comma-separated list (e.g. `Masculine, Adjective`).

   | Classification type                                          | Label                  |
   | ------------------------------------------------------------ | ---------------------- |
   | `Latinized::Gender::Masculine`                               | Masculine              |
   | `Latinized::Gender::Feminine`                                | Feminine               |
   | `Latinized::Gender::Neuter`                                  | Neuter                 |
   | `Latinized::PartOfSpeech::Adjective`                         | Adjective              |
   | `Latinized::PartOfSpeech::Participle`                        | Participle             |
   | `Latinized::PartOfSpeech::NounInApposition`                  | Noun in apposition     |
   | `Latinized::PartOfSpeech::NounInGenitiveCase`                | Noun in genitive case  |

3. **Gendered forms** — When the taxon belongs to the species group (rank includes `SpeciesGroup` or `SpeciesAndInfraspecies`) and is classified as an adjective or participle, the panel renders the `masculine_name`, `feminine_name`, and `neuter_name` properties of the taxon as a comma-separated list.

4. **Etymology** — If the taxon has an `etymology` field, it is rendered below the classifications using Markdown (HTML enabled).

5. **Visibility** — The card is hidden entirely when the taxon has no etymology, no gendered names, and no Latinized classifications.

## Project structure

```
PanelEtymology/
├── main.js                # Panel entry point and registration
└── PanelEtymology.vue     # Main panel component
```
