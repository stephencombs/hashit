import { createFileRoute } from "@tanstack/react-router";
import { Cron } from "croner";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { automations } from "~/db/schema";
import { updateAutomationBodySchema } from "~/features/automations/contracts/schemas";

export const Route = createFileRoute("/api/automations/$automationId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [row] = await db
          .select()
          .from(automations)
          .where(eq(automations.id, params.automationId))
          .limit(1);

        if (!row) {
          return Response.json(
            { error: "Automation not found" },
            { status: 404 },
          );
        }

        return Response.json(row);
      },

      PATCH: async ({ params, request }) => {
        const body = updateAutomationBodySchema.parse(await request.json());

        if (body.cronExpression) {
          try {
            new Cron(body.cronExpression, { maxRuns: 0 });
          } catch {
            return Response.json(
              { error: "Invalid cron expression" },
              { status: 400 },
            );
          }
        }

        const [existing] = await db
          .select()
          .from(automations)
          .where(eq(automations.id, params.automationId))
          .limit(1);

        if (!existing) {
          return Response.json(
            { error: "Automation not found" },
            { status: 404 },
          );
        }

        const cronExpr = body.cronExpression ?? existing.cronExpression;
        const enabled = body.enabled ?? existing.enabled;
        const nextRun = enabled ? new Cron(cronExpr).nextRun() : null;

        const set: Record<string, unknown> = {
          ...body,
          nextRunAt: nextRun,
          updatedAt: new Date(),
        };

        await db
          .update(automations)
          .set(set)
          .where(eq(automations.id, params.automationId));

        const [updated] = await db
          .select()
          .from(automations)
          .where(eq(automations.id, params.automationId))
          .limit(1);

        return Response.json(updated);
      },

      DELETE: async ({ params }) => {
        await db
          .update(automations)
          .set({ deletedAt: new Date(), enabled: false })
          .where(eq(automations.id, params.automationId));

        return new Response(null, { status: 204 });
      },
    },
  },
});
