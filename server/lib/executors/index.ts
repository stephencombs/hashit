import type { AutomationType } from '../../../src/db/schema'
import { executeChatPrompt } from './chat-prompt'
import { executeWebhook } from './webhook'

export interface ExecutorResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}

type Executor = (config: Record<string, unknown>) => Promise<ExecutorResult>

const executors: Record<AutomationType, Executor> = {
  'chat-prompt': executeChatPrompt,
  webhook: executeWebhook,
}

export function getExecutor(type: string): Executor | undefined {
  return executors[type as AutomationType]
}
