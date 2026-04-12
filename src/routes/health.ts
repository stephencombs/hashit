import { createFileRoute } from '@tanstack/react-router'
import { metrics } from '~/utils/metrics'
import { getErrors } from '~/utils/error-reporter'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () => {
        const payload = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version ?? '1.0.0',
          metrics: metrics.getAllStats(),
          recentErrors: getErrors().slice(-20),
        }

        return Response.json(payload)
      },
    },
  },
})
