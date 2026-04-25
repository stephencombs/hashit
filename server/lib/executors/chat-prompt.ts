import type { ExecutorResult } from "./index";
import { executeAutomationRun } from "../../../src/lib/automation-agent";

export async function executeChatPrompt(
  config: Record<string, unknown>,
): Promise<ExecutorResult> {
  const threadId = config.threadId as string | undefined;
  const prompt = config.prompt as string | undefined;

  if (!prompt) {
    return { success: false, error: "Missing prompt in automation config" };
  }

  const result = await executeAutomationRun(prompt, threadId);

  return {
    success: result.runState.status === "completed",
    error:
      result.runState.status === "completed"
        ? undefined
        : result.runState.error ||
          `Automation run ended with status: ${result.runState.status}`,
    data: {
      threadId: result.threadId,
      runStatus: result.runState.status,
      finishReason: result.runState.finishReason,
    },
  };
}
