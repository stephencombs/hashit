import * as fs from 'node:fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useRequest } from 'nitro/context'
import type { RequestLogger } from 'evlog'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  const log = useRequest().context.log as RequestLogger
  const count = await readCount()
  log.set({ action: 'getCount', count })
  return count
})

const updateCount = createServerFn({ method: 'POST' })
  .inputValidator((d: number) => d)
  .handler(async ({ data }) => {
    const log = useRequest().context.log as RequestLogger
    const count = await readCount()
    const next = count + data
    log.set({ action: 'updateCount', from: count, to: next })
    await fs.promises.writeFile(filePath, `${next}`)
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
