import * as fs from 'node:fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { logger } from '~/utils/logger'
import { metrics } from '~/utils/metrics'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  return metrics.measure('server_fn:getCount', async () => {
    logger.debug('Fetching count')
    const count = await readCount()
    logger.debug('Count fetched', { count })
    return count
  })
})

const updateCount = createServerFn({ method: 'POST' })
  .inputValidator((d: number) => d)
  .handler(async ({ data }) => {
    await metrics.measure('server_fn:updateCount', async () => {
      const count = await readCount()
      const next = count + data
      logger.info('Updating count', { from: count, to: next })
      await fs.promises.writeFile(filePath, `${next}`)
    })
  })

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const router = useRouter()
  const state = Route.useLoaderData()

  return (
    <button
      type="button"
      onClick={() => {
        updateCount({ data: 1 }).then(() => {
          router.invalidate()
        })
      }}
    >
      Add 1 to {state}?
    </button>
  )
}
