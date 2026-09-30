// ProjectStats.global.vue: the project statistics, usable on any page.

const component = 'project-stats'

const datasets = [
  { id: 'project:stats', group: 'project', label: 'Statistics', description: 'The project statistics.' }
]

async function project(ctx) {
  if (ctx.includes('project:stats')) await ctx.get('/stats')
}

export default { component, datasets, hooks: { project } }
