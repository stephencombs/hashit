import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DurableStreamTestServer } from '@durable-streams/server'

const port = Number(process.env.DURABLE_STREAMS_PORT ?? 4437)
const host = process.env.DURABLE_STREAMS_HOST ?? '127.0.0.1'
const dataDir = process.env.DURABLE_STREAMS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.DURABLE_STREAMS_DATA_DIR)
  : path.resolve(process.cwd(), 'data/durable-streams')

mkdirSync(dataDir, { recursive: true })

const server = new DurableStreamTestServer({ port, host, dataDir })

async function main(): Promise<void> {
  const url = await server.start()
  console.log(`[durable-streams] listening on ${url}`)
  console.log(`[durable-streams] data dir: ${dataDir}`)
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[durable-streams] received ${signal}, shutting down…`)
  try {
    await server.stop()
  } catch (err) {
    console.error('[durable-streams] stop failed', err)
  }
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch((err) => {
  console.error('[durable-streams] failed to start', err)
  process.exit(1)
})
