import type { ContentPart, ImagePart } from '@tanstack/ai'

export interface AttachmentDescriptor {
  url: string
  mimeType: string
  filename?: string
}

/**
 * Map an uploaded attachment to a TanStack AI ContentPart so it lands in the
 * outgoing `messages` payload (and therefore in the model run's context).
 *
 * Image MIMEs become `image` parts; PDFs become `document` parts. Anything
 * else falls back to a `document` part so the agent at least knows a file
 * was attached.
 */
export function attachmentToContentPart(attachment: AttachmentDescriptor): ContentPart {
  const source = {
    type: 'url' as const,
    value: attachment.url,
    mimeType: attachment.mimeType,
  }

  if (attachment.mimeType.startsWith('image/')) {
    return { type: 'image', source } satisfies ImagePart
  }
  if (attachment.mimeType.startsWith('audio/')) {
    return { type: 'audio', source }
  }
  if (attachment.mimeType.startsWith('video/')) {
    return { type: 'video', source }
  }
  return { type: 'document', source }
}

/**
 * Build the multimodal content array sent to TanStack `sendMessage`. Text is
 * placed first so the model reads the prompt context before the media.
 */
export function buildPromptContentParts(options: {
  text: string
  attachments: AttachmentDescriptor[]
}): Array<ContentPart> {
  const parts: Array<ContentPart> = []
  const trimmedText = options.text.trim()
  if (trimmedText.length > 0) {
    parts.push({ type: 'text', content: trimmedText })
  }
  for (const attachment of options.attachments) {
    parts.push(attachmentToContentPart(attachment))
  }
  return parts
}

/**
 * Capability check for the resolved model. Vision-capable Azure OpenAI
 * deployments (gpt-4o, gpt-4.1, gpt-4-turbo, gpt-5 family) accept image and
 * document parts; o-series reasoning and earlier 3.5/4 chat models do not.
 *
 * `model` may be undefined when the server falls back to the deployment env
 * default; callers in that case should treat `undefined` as the deployment
 * name so users still get a meaningful guard.
 */
export function isVisionCapableModel(model: string | undefined): boolean {
  if (!model) return false
  const normalized = model.toLowerCase()
  if (normalized.includes('gpt-4o')) return true
  if (normalized.includes('gpt-4.1')) return true
  if (normalized.includes('gpt-4-turbo')) return true
  if (/gpt-5(?:[.-]|$)/.test(normalized)) return true
  return false
}

/**
 * Returns true when any user message contains an image, audio, video, or
 * document part. Used by the chat route to decide whether the multimodal
 * capability guard applies.
 */
export function userMessagesContainMedia(messages: Array<unknown>): boolean {
  for (const message of messages) {
    if (!isMessageRecord(message)) continue
    if (message.role !== 'user') continue
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (const part of parts) {
      if (!isPartRecord(part)) continue
      if (
        part.type === 'image' ||
        part.type === 'audio' ||
        part.type === 'video' ||
        part.type === 'document'
      ) {
        return true
      }
    }
  }
  return false
}

function isMessageRecord(value: unknown): value is { role?: unknown; parts?: unknown } {
  return typeof value === 'object' && value !== null
}

function isPartRecord(value: unknown): value is { type?: string } {
  return typeof value === 'object' && value !== null
}
