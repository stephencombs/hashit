import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { artifacts } from "~/db/schema";

export const getArtifactsByThread = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(z.string()))
  .handler(async ({ data: threadId }) => {
    const rows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.threadId, threadId))
      .orderBy(desc(artifacts.createdAt));
    return rows;
  });
