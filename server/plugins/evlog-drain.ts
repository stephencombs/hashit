import type { DrainContext } from 'evlog'
import { createOTLPDrain } from 'evlog/otlp'
import { createDrainPipeline } from 'evlog/pipeline'
import { definePlugin } from 'nitro'
import {
  hasAnyOtlpEndpoint,
  resolveLogEndpoint,
  resolveOtlpHeaders,
} from '../../src/lib/telemetry/config'

export default definePlugin((nitroApp) => {
  if (!hasAnyOtlpEndpoint()) return

  const pipeline = createDrainPipeline<DrainContext>({
    batch: {
      size: 50,
      intervalMs: 5000,
    },
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelayMs: 1000,
      maxDelayMs: 30_000,
    },
    maxBufferSize: 1000,
    onDropped(events, error) {
      console.error(
        `[evlog/otlp] Dropped ${events.length} events:`,
        error?.message ?? 'unknown error',
      )
    },
  })

  const endpoint = resolveLogEndpoint()
  if (!endpoint) return

  const drain = pipeline(
    createOTLPDrain({
      endpoint,
      headers: resolveOtlpHeaders(),
    }),
  )

  nitroApp.hooks.hook('evlog:drain', drain)
  nitroApp.hooks.hook('close', () => drain.flush())
})
