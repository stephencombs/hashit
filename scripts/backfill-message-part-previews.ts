/**
 * One-shot backfill: compute argsPreview on tool-call parts and summary on
 * tool-result parts for all existing rows in messages.parts.
 *
 * Safe to re-run — already-enriched parts are skipped. Processes rows in
 * batches of 500 ordered by createdAt to stay friendly on memory and locks.
 *
 * Run after deploying the code change:
 *   pnpm db:backfill-previews
 */

import { db } from "../src/db";
import { messages } from "../src/db/schema";
import { asc, gt, eq } from "drizzle-orm";
import {
  buildArgsPreview,
  buildResultSummary,
} from "../src/shared/lib/server/message-part-previews";
import type { AppMessagePart } from "../src/shared/types/message-parts";

const BATCH_SIZE = 500;

function enrichParts(parts: AppMessagePart[]): {
  parts: AppMessagePart[];
  changed: boolean;
} {
  let changed = false;
  const next = parts.map((part) => {
    if (part.type === "tool-call") {
      if (part.argsPreview !== undefined) return part;
      const preview = buildArgsPreview(part.arguments);
      if (preview === undefined) return part;
      changed = true;
      return { ...part, argsPreview: preview };
    }
    if (part.type === "tool-result") {
      if (part.summary !== undefined) return part;
      const summary = buildResultSummary(part.content);
      if (summary === undefined) return part;
      changed = true;
      return { ...part, summary };
    }
    return part;
  });
  return { parts: next, changed };
}

async function main() {
  let total = 0;
  let updated = 0;
  let cursor: Date | undefined;

  process.stdout.write("Starting backfill of message part previews...\n");

  while (true) {
    const rows = await db
      .select({
        id: messages.id,
        parts: messages.parts,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(cursor ? gt(messages.createdAt, cursor) : undefined)
      .orderBy(asc(messages.createdAt))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      total++;
      if (!row.parts || row.parts.length === 0) continue;

      const { parts: nextParts, changed } = enrichParts(
        row.parts as AppMessagePart[],
      );
      if (!changed) continue;

      await db
        .update(messages)
        .set({ parts: nextParts })
        .where(eq(messages.id, row.id));
      updated++;
    }

    cursor = rows[rows.length - 1].createdAt;
    process.stdout.write(`  processed ${total} rows, updated ${updated}...\n`);

    if (rows.length < BATCH_SIZE) break;
  }

  process.stdout.write(
    `Done. Processed ${total} rows total, updated ${updated}.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
