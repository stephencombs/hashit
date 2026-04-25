import type { DurableChatSessionStreamTarget } from "@durable-streams/tanstack-ai-transport";
import { chat } from "@tanstack/ai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { v2Messages, v2Threads } from "~/db/schema";
import { getAzureAdapter } from "~/lib/openai-adapter";
import {
  appendV2CustomEvents,
  createV2CustomChunk,
} from "./persistence-runtime";
import { ATTACHMENT_ONLY_CONTENT_PREFIX } from "./user-message";

const GENERIC_THREAD_TITLES: ReadonlyArray<string> = ["Untitled", "New Chat"];
const FALLBACK_TITLE_DEPLOYMENT = "gpt-4.1-mini";
const TITLE_MAX_LENGTH = 64;

const inFlightTitleGenerations = new Set<string>();

type QueueV2ThreadTitleGenerationOptions = {
  threadId: string;
  streamTarget: DurableChatSessionStreamTarget;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isGenericTitle(value: string): boolean {
  const normalized = collapseWhitespace(value);
  return GENERIC_THREAD_TITLES.includes(normalized);
}

function normalizeGeneratedTitle(value: string): string | null {
  const withoutQuotes = value.replace(/^["'`]+|["'`]+$/g, "");
  const normalized = collapseWhitespace(withoutQuotes);
  if (!normalized) return null;

  let nextTitle = normalized;
  if (nextTitle.length > TITLE_MAX_LENGTH) {
    nextTitle = nextTitle.slice(0, TITLE_MAX_LENGTH).trimEnd();
  }

  if (!nextTitle || isGenericTitle(nextTitle)) {
    return null;
  }

  return nextTitle;
}

function resolveTitleDeployment(): string {
  const fromEnv = process.env.AZURE_OPENAI_TITLE_DEPLOYMENT?.trim();
  return fromEnv || FALLBACK_TITLE_DEPLOYMENT;
}

async function readFirstPromptForTitle(
  threadId: string,
): Promise<string | null> {
  const [thread] = await db
    .select({ title: v2Threads.title })
    .from(v2Threads)
    .where(eq(v2Threads.id, threadId))
    .limit(1);

  if (!thread || !isGenericTitle(thread.title)) {
    return null;
  }

  const [firstUserMessage] = await db
    .select({ content: v2Messages.content })
    .from(v2Messages)
    .where(and(eq(v2Messages.threadId, threadId), eq(v2Messages.role, "user")))
    .orderBy(asc(v2Messages.createdAt))
    .limit(1);

  if (!firstUserMessage) return null;

  const content = firstUserMessage.content.trim();
  if (!content || content.startsWith(ATTACHMENT_ONLY_CONTENT_PREFIX)) {
    return null;
  }

  return content;
}

async function generateTitleFromFirstPrompt(
  firstPrompt: string,
): Promise<string | null> {
  const titleStream = chat({
    adapter: getAzureAdapter(resolveTitleDeployment()),
    messages: [
      {
        role: "user",
        content: [
          "Generate a concise thread title.",
          "Rules:",
          "- max 6 words",
          "- no quotes",
          "- plain text only",
          "",
          `First user message: ${firstPrompt}`,
        ].join("\n"),
      },
    ],
  });

  let generated = "";
  for await (const chunk of titleStream) {
    if (chunk.type !== "TEXT_MESSAGE_CONTENT") continue;
    if (typeof chunk.content === "string") {
      generated = chunk.content;
      continue;
    }
    if (chunk.delta) {
      generated += chunk.delta;
    }
  }

  return normalizeGeneratedTitle(generated);
}

async function persistGeneratedTitle(
  threadId: string,
  title: string,
): Promise<boolean> {
  const updatedRows = await db
    .update(v2Threads)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(v2Threads.id, threadId),
        inArray(v2Threads.title, [...GENERIC_THREAD_TITLES]),
      ),
    )
    .returning({ id: v2Threads.id });

  return updatedRows.length > 0;
}

async function runV2ThreadTitleGeneration({
  threadId,
  streamTarget,
}: QueueV2ThreadTitleGenerationOptions): Promise<void> {
  const firstPrompt = await readFirstPromptForTitle(threadId);
  if (!firstPrompt) return;

  const generatedTitle = await generateTitleFromFirstPrompt(firstPrompt);
  if (!generatedTitle) return;

  const didUpdateTitle = await persistGeneratedTitle(threadId, generatedTitle);
  if (!didUpdateTitle) return;

  await appendV2CustomEvents(streamTarget, [
    createV2CustomChunk("thread_title_updated", {
      threadId,
      title: generatedTitle,
    }),
  ]);
}

export function queueV2ThreadTitleGeneration(
  options: QueueV2ThreadTitleGenerationOptions,
): void {
  const { threadId } = options;
  if (inFlightTitleGenerations.has(threadId)) return;

  inFlightTitleGenerations.add(threadId);
  void runV2ThreadTitleGeneration(options)
    .catch(() => {})
    .finally(() => {
      inFlightTitleGenerations.delete(threadId);
    });
}
