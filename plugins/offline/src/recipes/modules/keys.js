// The keys module (/keys/:id): a dichotomous key, which @sfgrp/pinpoint
// loads whole, opened from the keys panel.

const module = 'keys'

/**
 * @param {object} ctx
 * @param {number} leadId
 */
export async function key(ctx, leadId) {
  await ctx.get(`/leads/key/${leadId}`)
}

export default { module }
