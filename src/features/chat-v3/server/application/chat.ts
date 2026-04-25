import {
  convertToModelMessages,
  createIdGenerator,
  generateText,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createHttpError } from "~/shared/lib/http-error";
import {
  ensureV3ThreadServer,
  saveV3ThreadMessagesServer,
  setV3ThreadTitleServer,
} from "./threads";

const GENERIC_THREAD_TITLES = new Set(["New Chat", "Untitled"]);
const TITLE_MAX_LENGTH = 64;
const TITLE_MAX_MESSAGES = 8;
const TITLE_MAX_TRANSCRIPT_CHARS = 2_000;

export type SubmitV3ChatTurnInput = {
  id: string;
  messages: Array<UIMessage>;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
};

function assertV3ChatEnvironment(): void {
  if (
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_DEPLOYMENT
  ) {
    return;
  }

  throw createHttpError({
    message: "Azure OpenAI environment variables not configured",
    status: 500,
    why: "Missing one or more required environment variables.",
    fix: "Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT.",
  });
}

function resolveV3AzureModel(requestedModel?: string) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, "");
  const azure = createAzure({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    baseURL: `${endpoint}/openai`,
  });
  const deployment =
    requestedModel?.trim() || process.env.AZURE_OPENAI_DEPLOYMENT!;
  return azure(deployment);
}

function resolveTemperature(value?: number): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(2, Math.max(0, value));
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildTitlePrompt(messages: Array<UIMessage>): string | null {
  const transcript: string[] = [];
  let remainingChars = TITLE_MAX_TRANSCRIPT_CHARS;

  for (const message of messages.slice(0, TITLE_MAX_MESSAGES)) {
    const text = collapseWhitespace(getMessageText(message));
    if (!text) continue;

    const line = `${message.role}: ${text}`;
    transcript.push(line.slice(0, remainingChars));
    remainingChars -= line.length;
    if (remainingChars <= 0) break;
  }

  if (transcript.length === 0) return null;

  return [
    "Generate a concise title for this chat thread.",
    "",
    "Rules:",
    "- max 6 words",
    "- no quotes",
    "- no punctuation unless needed",
    "- plain text only",
    "",
    "Conversation:",
    transcript.join("\n"),
  ].join("\n");
}

function normalizeGeneratedTitle(value: string): string | undefined {
  const withoutQuotes = value.replace(/^["'`]+|["'`]+$/g, "");
  const normalized = collapseWhitespace(withoutQuotes);
  if (!normalized || GENERIC_THREAD_TITLES.has(normalized)) return undefined;

  const title = normalized.slice(0, TITLE_MAX_LENGTH).trimEnd();
  return title || undefined;
}

async function generateThreadTitle(params: {
  currentTitle: string;
  messages: Array<UIMessage>;
  model?: string;
}): Promise<string | undefined> {
  if (!GENERIC_THREAD_TITLES.has(params.currentTitle)) return undefined;

  const prompt = buildTitlePrompt(params.messages);
  if (!prompt) return undefined;

  const { text } = await generateText({
    model: resolveV3AzureModel(
      process.env.AZURE_OPENAI_TITLE_DEPLOYMENT?.trim() || params.model,
    ),
    prompt,
    temperature: 0.2,
    maxOutputTokens: 24,
  });
  return normalizeGeneratedTitle(text);
}

async function updateThreadTitleFromMessages(params: {
  threadId: string;
  currentTitle: string;
  messages: Array<UIMessage>;
  model?: string;
}): Promise<void> {
  const title = await generateThreadTitle(params);
  if (!title) return;

  await setV3ThreadTitleServer({
    threadId: params.threadId,
    title,
  });
}

export async function submitV3ChatTurn({
  id,
  messages,
  model,
  temperature,
  systemPrompt,
}: SubmitV3ChatTurnInput): Promise<Response> {
  assertV3ChatEnvironment();

  if (messages.length === 0) {
    throw createHttpError({
      message: "V3 request has no messages",
      status: 400,
      why: "The chat request did not include any UI messages.",
      fix: "Send at least one user message.",
    });
  }

  const thread = await ensureV3ThreadServer({ id });
  const validatedMessages = await validateUIMessages({ messages });
  const resolvedSystemPrompt = systemPrompt?.trim();
  const result = streamText({
    model: resolveV3AzureModel(model),
    messages: await convertToModelMessages(validatedMessages),
    ...(resolvedSystemPrompt ? { system: resolvedSystemPrompt } : {}),
    ...(temperature == null
      ? {}
      : { temperature: resolveTemperature(temperature) }),
  });

  void result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    generateMessageId: createIdGenerator({
      prefix: "msg",
      size: 16,
    }),
    onFinish: async ({ messages: finalMessages }) => {
      await saveV3ThreadMessagesServer({
        threadId: id,
        messages: finalMessages,
      });

      try {
        await updateThreadTitleFromMessages({
          threadId: id,
          currentTitle: thread.title,
          messages: finalMessages,
          model,
        });
      } catch {
        // Title generation is best-effort; message persistence has already succeeded.
      }
    },
  });
}
