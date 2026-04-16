import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { selectThreadSchema } from './schemas'

export const threadListQuery = queryOptions({
  queryKey: ['threads'],
  queryFn: async () => {
    const res = await fetch('/api/threads')
    return z.array(selectThreadSchema).parse(await res.json())
  },
  staleTime: 30_000,
})

export const threadDetailQuery = (threadId: string) =>
  queryOptions({
    queryKey: ['threads', threadId],
    queryFn: async () => {
      const { getThread } = await import('~/routes/chat.$threadId')
      return getThread({ data: threadId })
    },
    staleTime: 60_000,
  })
