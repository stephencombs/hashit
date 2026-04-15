import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  experimental: {
    asyncContext: true,
    tasks: true,
  },
  tasks: {
    'automations:tick': {
      handler: './tasks/automations/tick.ts',
      description: 'Poll and execute due automations',
    },
  },
  scheduledTasks: {
    '* * * * *': ['automations:tick'],
  },
  modules: [
    evlog({
      env: { service: 'hashit' },
      exclude: ['/health'],
    }),
  ],
})
