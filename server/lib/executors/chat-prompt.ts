import type { ExecutorResult } from './index'

export async function executeChatPrompt(
  config: Record<string, unknown>,
): Promise<ExecutorResult> {
  const threadId = config.threadId as string | undefined
  const prompt = config.prompt as string | undefined

  if (!prompt) {
    return { success: false, error: 'Missing prompt in automation config' }
  }

  const body = {
    prompt,
    ...(threadId && { threadId }),
  }

  const port = process.env.PORT || '3000'
  const baseUrl =
    process.env.APP_URL ||
    process.env.PORTLESS_URL ||
    `http://localhost:${port}`
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    return { success: false, error: `Agent API returned ${res.status}: ${text}` }
  }

  const reader = res.body?.getReader()
  if (reader) {
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }

  return { success: true, data: { threadId } }
}
