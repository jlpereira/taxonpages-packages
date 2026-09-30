import { defineStore } from 'pinia'
import { makeAPIRequest } from '@/utils/request'
import useSettingsStore from './settings'

export default defineStore('dichotomous', {
  state: () => ({
    lead: undefined,
    root: undefined,
    children: [],
    lead_item_otus: [],
    key_metadata: undefined,
    key_data: {},
    key_ordered_parents: [],
    key_depictions: [],
    remaining: [],
    eliminated: []
  }),

  getters: {
    keyTree(state) {
      if (
        !state.key_metadata ||
        !state.key_data ||
        !state.key_ordered_parents
      ) {
        return null
      }

      const nodesById = {}

      state.key_ordered_parents.forEach((parentId) => {
        const meta = state.key_metadata[parentId]
        const depictions = state.key_data[parentId]?.figures || []
        const metaParent = meta.parent_id
          ? state.key_metadata[meta.parent_id]
          : null

        nodesById[parentId] = {
          id: parentId,
          coupletNumber: meta.couplet_number,
          depth: meta.depth,
          backLink: metaParent?.couplet_number,
          children: [],
          depictions,
          _childIds: meta.children
        }
      })

      Object.values(nodesById).forEach((node) => {
        node.children = node._childIds.map((childId) => {
          const data = state.key_data[childId]
          const depictions = state.key_depictions[childId]
          const isFirstLine = data.position === 0

          let linkType = null
          if (!data.target_label) {
            linkType =
              data.target_type === 'lead_item_otus' ? 'lead_item_otus' : null
          } else if (data.target_type === 'internal') {
            linkType = 'couplet'
          } else if (data.target_type === 'lead_item_otus') {
            linkType = 'lead_item_otus'
          } else {
            linkType = 'otu'
          }

          return {
            id: childId,
            parentId: node.id,
            position: data.position,
            depictions,
            isFirstLine,
            text: data.text || '<no text>',
            coupletNumber: node.coupletNumber,
            beginLabel: isFirstLine
              ? node.coupletNumber
              : '.'.repeat(7 + node.coupletNumber.toString().length),
            linkType,
            targetId: data.target_id,
            targetLabel: data.target_label,
            leadItemOtus: data.lead_item_otus || [],
            hasMultipleOtus: data.lead_item_otus?.length > 1,
            hasSingleOtuWithoutTarget:
              data.lead_item_otus?.length === 1 && !data.target_id
          }
        })
      })

      Object.values(nodesById).forEach((node) => {
        node.children.forEach((child) => {
          if (child.linkType === 'couplet') {
            const targetNode = Object.values(nodesById).find(
              (n) => n.coupletNumber === child.targetLabel
            )
            if (targetNode) {
              child.nextCouplet = targetNode
            }
          }
        })
      })

      return Object.values(nodesById).find((n) => n.depth === 1)
    }
  },

  actions: {
    setCurrentLead(id) {
      if (id == null || !this.key_metadata) return

      const numericId = Number(id)
      const entry = this.key_metadata[id] || this.key_metadata[numericId]

      this.lead = {
        id: numericId,
        parentId: entry?.parent_id ?? null
      }

      this.refreshOtus(id)
    },

    async refreshOtus(leadId) {
      const isCurrent = () => String(this.lead?.id) === String(leadId)

      this.remaining = []
      this.eliminated = []

      makeAPIRequest
        .get(`/leads/${leadId}/remaining_otus.json`)
        .then(({ data }) => {
          if (isCurrent()) this.remaining = data || []
        })
        .catch(() => {})

      makeAPIRequest
        .get(`/leads/${leadId}/eliminated_otus.json`)
        .then(({ data }) => {
          if (isCurrent()) this.eliminated = data || []
        })
        .catch(() => {})
    },

    async loadKey(id) {
      const settings = useSettingsStore()

      try {
        settings.isLoading = true

        const { data: response } = await makeAPIRequest(`/leads/key/${id}.json`)
        const { metadata = {}, data = {} } = response || {}
        const entries = data.entries || {}
        const leads = data.leads || {}

        const rootEntryKey = Object.keys(entries).find(
          (entryId) => entries[entryId].parent_id === null
        )
        const rootId = rootEntryKey ? Number(rootEntryKey) : null

        this.root = {
          id: rootId,
          text: metadata.title || '',
          citations: metadata.origin_citation
            ? [{ citation_source_body: metadata.origin_citation }]
            : []
        }

        const numericId = Number(id)
        const focusedEntry = entries[id] || entries[numericId]

        this.lead = {
          id: numericId,
          parentId: focusedEntry?.parent_id ?? null
        }

        this.children = []
        this.lead_item_otus = []

        this.key_metadata = entries
        this.key_ordered_parents = Object.keys(entries).map(Number)
        this.key_data = leads
        this.key_depictions = {}

        this.remaining = []
        this.eliminated = []

        this.refreshOtus(this.lead.id)
      } catch {
      } finally {
        settings.isLoading = false
      }
    }
  }
})
