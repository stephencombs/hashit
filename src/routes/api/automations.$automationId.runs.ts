import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, count } from 'drizzle-orm'
import { db } from '~/db'
import { automationRuns } from '~/db/schema'

const PAGE_SIZE = 10

export const Route = createFileRoute(
  '/api/automations/$automationId/runs',
)({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url)
        const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
        const offset = (page - 1) * PAGE_SIZE

        const [runs, [{ total }]] = await Promise.all([
          db
            .select()
            .from(automationRuns)
            .where(eq(automationRuns.automationId, params.automationId))
            .orderBy(desc(automationRuns.startedAt))
            .limit(PAGE_SIZE)
            .offset(offset),
          db
            .select({ total: count() })
            .from(automationRuns)
            .where(eq(automationRuns.automationId, params.automationId)),
        ])

        return Response.json({
          runs,
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
        })
      },
    },
  },
})
