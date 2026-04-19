import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import {
  selectCanvasSchema,
  selectNodeVersionSchema,
} from './canvas-schemas'

export const canvasListQuery = queryOptions({
  queryKey: ['canvases'],
  queryFn: async () => {
    const res = await fetch('/api/canvas')
    return z.array(selectCanvasSchema).parse(await res.json())
  },
  staleTime: 60_000,
})

export const canvasDetailQuery = (canvasId: string) =>
  queryOptions({
    queryKey: ['canvases', canvasId],
    queryFn: async () => {
      const { getCanvas } = await import('~/routes/_app.canvas.$canvasId')
      return getCanvas({ data: canvasId })
    },
    staleTime: 60_000,
  })

export const nodeVersionsQuery = (canvasId: string, nodeId: string) =>
  queryOptions({
    queryKey: ['canvases', canvasId, 'nodes', nodeId, 'versions'],
    queryFn: async () => {
      const res = await fetch(
        `/api/canvas/${canvasId}/nodes/${nodeId}/versions`,
      )
      return z.array(selectNodeVersionSchema).parse(await res.json())
    },
  })
