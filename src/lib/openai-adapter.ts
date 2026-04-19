import { createOpenaiChat } from '@tanstack/ai-openai'

export function getAzureAdapter(deployment?: string) {
  const model = deployment || process.env.AZURE_OPENAI_DEPLOYMENT!
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '')
  const baseURL = `${endpoint}/openai/v1`

  return createOpenaiChat(model as any, process.env.AZURE_OPENAI_API_KEY!, {
    baseURL,
  })
}
