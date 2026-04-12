import { logger } from './logger'

interface ErrorRecord {
  count: number
  firstSeen: string
  lastSeen: string
  name: string
  message: string
  stack?: string
  context?: unknown
}

const store = new Map<string, ErrorRecord>()

export function reportError(error: unknown, context?: unknown) {
  const err =
    error instanceof Error ? error : new Error(String(error))

  const key = `${err.name}:${err.message}`
  const now = new Date().toISOString()
  const existing = store.get(key)

  if (existing) {
    existing.count++
    existing.lastSeen = now
    if (context !== undefined) existing.context = context
  } else {
    store.set(key, {
      count: 1,
      firstSeen: now,
      lastSeen: now,
      name: err.name,
      message: err.message,
      stack: err.stack,
      context,
    })
  }

  logger.error('Error reported', {
    error: err.message,
    count: existing ? existing.count : 1,
    context,
  })
}

export function getErrors(): Array<ErrorRecord & { id: string }> {
  return Array.from(store.entries()).map(([id, data]) => ({ id, ...data }))
}

export function clearErrors() {
  store.clear()
}
