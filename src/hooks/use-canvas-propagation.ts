import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Edge } from '@xyflow/react'

function topologicalSort(
  startNodeId: string,
  edges: Edge[],
): string[] {
  const graph = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const edge of edges) {
    if (!graph.has(edge.source)) graph.set(edge.source, [])
    graph.get(edge.source)!.push(edge.target)

    if (!inDegree.has(edge.target)) inDegree.set(edge.target, 0)
    inDegree.set(edge.target, inDegree.get(edge.target)! + 1)

    if (!inDegree.has(edge.source)) inDegree.set(edge.source, 0)
  }

  const reachable = new Set<string>()
  const queue = [startNodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = graph.get(current) || []
    for (const child of children) {
      if (!reachable.has(child)) {
        reachable.add(child)
        queue.push(child)
      }
    }
  }

  const filteredEdges = edges.filter(
    (e) => reachable.has(e.source) && reachable.has(e.target),
  )

  const subInDegree = new Map<string, number>()
  const subGraph = new Map<string, string[]>()

  for (const nodeId of reachable) {
    subInDegree.set(nodeId, 0)
    subGraph.set(nodeId, [])
  }

  for (const edge of filteredEdges) {
    subGraph.get(edge.source)!.push(edge.target)
    subInDegree.set(edge.target, subInDegree.get(edge.target)! + 1)
  }

  const sorted: string[] = []
  const ready: string[] = []

  for (const [nodeId, degree] of subInDegree) {
    if (degree === 0) ready.push(nodeId)
  }

  while (ready.length > 0) {
    const current = ready.shift()!
    sorted.push(current)
    for (const child of subGraph.get(current) || []) {
      const newDegree = subInDegree.get(child)! - 1
      subInDegree.set(child, newDegree)
      if (newDegree === 0) ready.push(child)
    }
  }

  return sorted
}

export interface PropagationCallbacks {
  onNodeStatusChange: (nodeId: string, status: string) => void
  onNodeContentUpdate: (
    nodeId: string,
    content: Record<string, unknown>,
  ) => void
}

export function useCanvasPropagation(
  canvasId: string,
  edges: Edge[],
  callbacks: PropagationCallbacks,
) {
  const queryClient = useQueryClient()
  const propagatingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const generateNode = useCallback(
    async (nodeId: string) => {
      callbacks.onNodeStatusChange(nodeId, 'generating')

      try {
        const res = await fetch(
          `/api/canvas/${canvasId}/nodes/${nodeId}/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: abortRef.current?.signal,
          },
        )

        if (!res.ok) {
          callbacks.onNodeStatusChange(nodeId, 'error')
          return []
        }

        const reader = res.body?.getReader()
        if (!reader) {
          callbacks.onNodeStatusChange(nodeId, 'error')
          return []
        }

        const decoder = new TextDecoder()
        let accumulated = ''
        let downstreamNodeIds: string[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue

            try {
              const chunk = JSON.parse(jsonStr)
              if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
                accumulated += chunk.delta
              }
              if (chunk.type === 'CUSTOM' && chunk.name === 'generation_complete') {
                downstreamNodeIds = chunk.value?.downstreamNodeIds || []
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        if (accumulated) {
          callbacks.onNodeContentUpdate(nodeId, { html: accumulated })
        }

        callbacks.onNodeStatusChange(nodeId, 'idle')

        queryClient.invalidateQueries({
          queryKey: ['canvases', canvasId],
        })

        return downstreamNodeIds
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return []
        callbacks.onNodeStatusChange(nodeId, 'error')
        return []
      }
    },
    [canvasId, callbacks, queryClient],
  )

  const propagate = useCallback(
    async (startNodeId: string) => {
      if (propagatingRef.current) return
      propagatingRef.current = true
      abortRef.current = new AbortController()

      try {
        const sorted = topologicalSort(startNodeId, edges)

        const completed = new Set<string>()

        for (const nodeId of sorted) {
          if (abortRef.current.signal.aborted) break

          const incomingEdges = edges.filter((e) => e.target === nodeId)
          const allParentsDone = incomingEdges.every(
            (e) => completed.has(e.source) || e.source === startNodeId,
          )

          if (!allParentsDone) {
            continue
          }

          await generateNode(nodeId)
          completed.add(nodeId)
        }
      } finally {
        propagatingRef.current = false
        abortRef.current = null
      }
    },
    [edges, generateNode],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    propagatingRef.current = false
  }, [])

  return { propagate, generateNode, cancel, isPropagating: propagatingRef }
}
