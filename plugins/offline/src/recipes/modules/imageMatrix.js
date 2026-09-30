import { ok } from '../utils.js'

// The ImageMatrix module (/image_matrices/:id), opened from the keys panel
// for media matrices: every page of a matrix, without an OTU filter.

const module = 'image-matrix'

const PER = 50

/**
 * @param {object} ctx
 * @param {number} matrixId
 */
export async function matrix(ctx, matrixId) {
  for (let page = 1; ; page += 1) {
    const response = await ctx.get(`/observation_matrices/${matrixId}/image_matrix`, {
      otu_filter: undefined,
      page,
      per: PER
    })

    if (!ok(response)) return

    const total = Number(response.data?.pagination?.pagination_total) || 0
    if (page * PER >= total) return
  }
}

export default { module }
