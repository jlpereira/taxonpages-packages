/**
 * Panels the layout shows, each with the localized `bind` of every place it
 * appears, and the rank groups it is limited to there.
 *
 * @param {object} layout - `taxa_page` configuration
 * @param {(bind: object) => object[]} localizeBind - One bind per locale
 * @param {Record<string, string[]>} [rankGroupsById] - The rank groups each
 *   panel is limited to by default, as its recipe declares them
 * @returns {Map<string, Array<{ bind: object, rankGroups: string[][] }>>}
 */
export function panelsInLayout(layout, localizeBind, rankGroupsById = {}) {
  const panels = new Map()

  for (const tab of Object.values(layout || {})) {
    if (!tab || !Array.isArray(tab.panels)) continue

    const tabRankGroup = Array.isArray(tab.rank_group) ? tab.rank_group : []

    for (const row of tab.panels) {
      for (const column of row || []) {
        for (const ref of column || []) {
          const { id, bind = {}, rank_group } = typeof ref === 'string' ? { id: ref } : ref || {}
          if (!id) continue

          const panelRankGroup = Array.isArray(rank_group) ? rank_group : rankGroupsById[id] || []
          const entries = panels.get(id) || []

          for (const localized of localizeBind(bind)) {
            entries.push({ bind: localized, rankGroups: [tabRankGroup, panelRankGroup] })
          }

          panels.set(id, entries)
        }
      }
    }
  }

  return panels
}

/**
 * Same test as the core's isAvailableForRank, applied to every rank-group
 * list that limits a panel (its tab's and its own).
 */
export function isAvailableForRank(rankGroups, rankString) {
  return rankGroups.every(
    (groups) => !groups.length || groups.some((group) => rankString?.includes(group))
  )
}
