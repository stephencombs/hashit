import { defineTask } from 'nitro/task'
import { eq, lte, and, isNull } from 'drizzle-orm'
import { Cron } from 'croner'
import { db } from '../../src/db'
import { automations, automationRuns } from '../../src/db/schema'
import { getExecutor } from '../../server/lib/executors'

export default defineTask({
  meta: {
    name: 'automations:tick',
    description: 'Poll and execute due automations',
  },
  async run() {
    const now = new Date()

    const dueJobs = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.enabled, true),
          isNull(automations.deletedAt),
          lte(automations.nextRunAt, now),
        ),
      )

    let executed = 0

    for (const job of dueJobs) {
      const nextRun = new Cron(job.cronExpression).nextRun()

      // Atomically claim by updating only if still due (compare-and-swap)
      const claimed = await db
        .update(automations)
        .set({ nextRunAt: nextRun ?? undefined, updatedAt: now })
        .where(
          and(
            eq(automations.id, job.id),
            lte(automations.nextRunAt, now),
          ),
        )
        .returning({ id: automations.id })

      if (claimed.length === 0) continue
      executed++

      const runId = crypto.randomUUID()

      await db.insert(automationRuns).values({
        id: runId,
        automationId: job.id,
        startedAt: now,
        status: 'running',
      })

      const executor = getExecutor(job.type)
      if (!executor) {
        await db
          .update(automationRuns)
          .set({
            status: 'failure',
            completedAt: new Date(),
            result: { error: `Unknown automation type: ${job.type}` },
          })
          .where(eq(automationRuns.id, runId))
        continue
      }

      try {
        const result = await executor(job.config)
        const completedAt = new Date()

        await db
          .update(automationRuns)
          .set({
            status: result.success ? 'success' : 'failure',
            completedAt,
            result,
          })
          .where(eq(automationRuns.id, runId))

        await db
          .update(automations)
          .set({ lastRunAt: completedAt, updatedAt: completedAt })
          .where(eq(automations.id, job.id))
      } catch (err) {
        const completedAt = new Date()
        await db
          .update(automationRuns)
          .set({
            status: 'failure',
            completedAt,
            result: {
              error: err instanceof Error ? err.message : String(err),
            },
          })
          .where(eq(automationRuns.id, runId))

        await db
          .update(automations)
          .set({ lastRunAt: completedAt, updatedAt: completedAt })
          .where(eq(automations.id, job.id))
      }
    }

    return { result: { executed } }
  },
})
