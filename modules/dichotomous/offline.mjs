export default {
  hooks: {
    async otu(ctx) {
      const { status, data } = await ctx.get(
        `/otus/${ctx.otuId}/inventory/keys`
      )
      if (status !== 200) return

      const leads = [...(data?.leads?.scoped || []), ...(data?.leads?.in || [])]

      await Promise.all(
        leads.map(({ id }) =>
          ctx.once(`dichotomous:${id}`, async () => {
            const key = await ctx.get(`/leads/key/${id}.json`)
            if (key.status !== 200) return

            const entries = Object.keys(key.data?.data?.entries || {})

            await Promise.all(
              entries.flatMap((leadId) => [
                ctx.get(`/leads/${leadId}/remaining_otus.json`),
                ctx.get(`/leads/${leadId}/eliminated_otus.json`)
              ])
            )
          })
        )
      )
    }
  }
}
