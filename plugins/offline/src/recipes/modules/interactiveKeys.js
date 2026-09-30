// The interactiveKeys module (/interactive_keys/:id), through
// @sfgrp/distinguish. Nothing to sync: TaxonWorks computes the key for every
// combination of chosen states.

const module = 'interactive-keys'

const unavailable = [
  {
    match: /^observation_matrices\/\d+\/key/,
    reason: 'Interactive keys: TaxonWorks computes them for each combination of chosen states.'
  }
]

export default { module, unavailable }
