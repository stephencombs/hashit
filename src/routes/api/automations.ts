import { createFileRoute } from "@tanstack/react-router";
import { Cron } from "croner";
import { nanoid } from "nanoid";
import { desc, isNull } from "drizzle-orm";
import { db } from "~/db";
import { automations } from "~/db/schema";
import { createAutomationBodySchema } from "~/lib/schemas";

export const Route = createFileRoute("/api/automations")({
  server: {
    handlers: {
      GET: async () => {
        const all = await db
          .select()
          .from(automations)
          .where(isNull(automations.deletedAt))
          .orderBy(desc(automations.createdAt));

        return Response.json(all);
      },

      POST: async ({ request }) => {
        const body = createAutomationBodySchema.parse(await request.json());

        try {
          new Cron(body.cronExpression, { maxRuns: 0 });
        } catch {
          return Response.json(
            { error: "Invalid cron expression" },
            { status: 400 },
          );
        }

        const now = new Date();
        const nextRun = new Cron(body.cronExpression).nextRun();

        const automation = {
          id: nanoid(),
          name: body.name,
          type: body.type,
          cronExpression: body.cronExpression,
          config: body.config,
          enabled: body.enabled,
          nextRunAt: body.enabled ? nextRun : null,
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(automations).values(automation);

        return Response.json(automation, { status: 201 });
      },
    },
  },
});
