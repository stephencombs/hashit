import type { ExecutorResult } from './index'
import { executeAutomationRun } from '../../../src/lib/automation-agent'

export async function executeChatPrompt(
  config: Record<string, unknown>,
): Promise<ExecutorResult> {
  const threadId = config.threadId as string | undefined
  const prompt = config.prompt as string | undefined

  if (!prompt) {
    return { success: false, error: 'Missing prompt in automation config' }
  }

  const result = await executeAutomationRun(prompt, threadId)

  return {
    success: result.telemetry.status === 'completed',
    error:
      result.telemetry.status === 'completed'
        ? undefined
        : result.telemetry.error ||
          `Automation run ended with status: ${result.telemetry.status}`,
    data: {
      threadId: result.threadId,
      runStatus: result.telemetry.status,
      finishReason: result.telemetry.finishReason,
      durationMs: result.telemetry.durationMs,
      toolCallCount: result.telemetry.toolCallCount,
      iterationCount: result.telemetry.iterationCount,
      totalTokens: result.telemetry.usage?.totalTokens,
      requestId: result.telemetry.requestId,
      traceId: result.telemetry.traceId,
      spanId: result.telemetry.spanId,
      mcpServersUsed: result.telemetry.mcpServersUsed,
    },
  }
}
