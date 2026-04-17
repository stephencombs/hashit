import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { selectThreadSchema } from './schemas'

export const threadListQuery = queryOptions({
  queryKey: ['threads'],
  queryFn: async () => {
    const { listThreads } = await import('~/lib/server/threads')
    const rows = await listThreads()
    return z.array(selectThreadSchema).parse(rows)
  },
  staleTime: 30_000,
})

export const threadDetailQuery = (threadId: string) =>
  queryOptions({
    queryKey: ['threads', threadId],
    queryFn: async () => {
      const { getThread } = await import('~/routes/_app.chat.$threadId')
      return getThread({ data: threadId })
    },
    staleTime: 60_000,
  })

export interface ThreadArtifact {
  id: string
  title: string
  messageId: string | null
  threadId: string | null
  specIndex?: number
}

export const artifactsByThreadQuery = (threadId: string) =>
  queryOptions({
    queryKey: ['artifacts', threadId],
    queryFn: async (): Promise<ThreadArtifact[]> => {
      const { getArtifactsByThread } = await import('~/lib/server/artifacts')
      const rows = await getArtifactsByThread({ data: threadId })
      return rows as unknown as ThreadArtifact[]
    },
    staleTime: 60_000,
  })
