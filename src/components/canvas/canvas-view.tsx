import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react'
import { Canvas } from '~/components/ai-elements/canvas'
import { Edge as AiEdge } from '~/components/ai-elements/edge'
import { Connection } from '~/components/ai-elements/connection'
import { Controls } from '~/components/ai-elements/controls'
import { CanvasToolbar } from '~/components/canvas/canvas-toolbar'
import { VersionPanel } from '~/components/canvas/version-panel'
import { SdlcNode } from '~/components/canvas/sdlc-node'
import { useCanvasPropagation } from '~/hooks/use-canvas-propagation'
import type { CanvasWithNodes } from '~/lib/canvas-schemas'
import type { CanvasNodeType } from '~/db/schema'
import type {
  Edge,
  OnConnect,
  NodeTypes,
  EdgeTypes,
} from '@xyflow/react'
import type { SdlcNodeData } from '~/components/canvas/sdlc-node'

const edgeTypes: EdgeTypes = {
  animated: AiEdge.Animated,
}

interface CanvasViewInnerProps {
  canvas: CanvasWithNodes
}

const defaultPositions: Record<CanvasNodeType, { x: number; y: number }> = {
  prd: { x: 50, y: 200 },
  user_stories: { x: 800, y: 50 },
  uiux_spec: { x: 800, y: 500 },
  tech_architecture: { x: 1550, y: 500 },
  task_breakdown: { x: 2300, y: 200 },
}

let positionCounter = 0

function CanvasViewInner({ canvas }: CanvasViewInnerProps) {
  const queryClient = useQueryClient()
  const [versionPanel, setVersionPanel] = useState<{
    nodeId: string
    label: string
  } | null>(null)

  const handleGenerate = useCallback(
    (nodeId: string, userInput?: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, status: 'generating' } }
            : n,
        ),
      )

      fetch(`/api/canvas/${canvas.id}/nodes/${nodeId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Generation failed')

          const reader = res.body?.getReader()
          if (!reader) return

          const decoder = new TextDecoder()
          let accumulated = ''
          let downstreamIds: string[] = []
          let lastFlush = 0
          const THROTTLE_MS = 150

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
                if (
                  chunk.type === 'CUSTOM' &&
                  chunk.name === 'generation_complete'
                ) {
                  downstreamIds = chunk.value?.downstreamNodeIds || []
                }
              } catch {
                // skip
              }
            }

            const now = Date.now()
            if (accumulated && now - lastFlush >= THROTTLE_MS) {
              lastFlush = now
              const content = { markdown: accumulated }
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === nodeId
                    ? { ...n, data: { ...n.data, content } }
                    : n,
                ),
              )
            }
          }

          if (accumulated) {
            const content = { markdown: accumulated }
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? { ...n, data: { ...n.data, content, status: 'idle' } }
                  : n,
              ),
            )

            queryClient.invalidateQueries({
              queryKey: ['canvases', canvas.id],
            })

            if (downstreamIds.length > 0) {
              for (const dsId of downstreamIds) {
                handleGenerate(dsId)
              }
            }
          } else {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? { ...n, data: { ...n.data, status: 'idle' } }
                  : n,
              ),
            )
          }
        })
        .catch(() => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, status: 'error' } }
                : n,
            ),
          )
        })
    },
    [canvas.id, queryClient],
  )

  const handleContentUpdate = useCallback(
    (nodeId: string, content: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, content } } : n,
        ),
      )
    },
    [],
  )

  const handleShowVersions = useCallback(
    (nodeId: string) => {
      const node = canvas.nodes.find((n) => n.id === nodeId)
      setVersionPanel({
        nodeId,
        label: node?.label ?? 'Node',
      })
    },
    [canvas.nodes],
  )

  const handleRestore = useCallback(
    (nodeId: string, content: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, content } } : n,
        ),
      )
    },
    [],
  )

  const propagationCallbacks = useMemo(
    () => ({
      onNodeStatusChange: (nodeId: string, status: string) => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, status } } : n,
          ),
        )
      },
      onNodeContentUpdate: handleContentUpdate,
    }),
    [handleContentUpdate],
  )

  const initialNodes: Node[] = useMemo(
    () =>
      canvas.nodes.map((n) => ({
        id: n.id,
        type: 'sdlc',
        position: { x: n.positionX, y: n.positionY },
        data: {
          canvasId: canvas.id,
          type: n.type,
          label: n.label,
          content: n.content,
          status: n.status,
          onGenerate: handleGenerate,
          onContentUpdate: handleContentUpdate,
          onShowVersions: handleShowVersions,
        } satisfies SdlcNodeData,
      })),
    [],
  )

  const initialEdges: Edge[] = useMemo(
    () =>
      canvas.edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        type: 'animated',
      })),
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useCanvasPropagation(canvas.id, edges, propagationCallbacks)

  const nodeTypes: NodeTypes = useMemo(
    () => ({ sdlc: SdlcNode as any }),
    [],
  )

  const createEdgeMutation = useMutation({
    mutationFn: async ({
      sourceNodeId,
      targetNodeId,
    }: {
      sourceNodeId: string
      targetNodeId: string
    }) => {
      const res = await fetch(`/api/canvas/${canvas.id}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNodeId, targetNodeId }),
      })
      return res.json()
    },
  })

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, type: 'animated' }, eds),
      )
      if (connection.source && connection.target) {
        createEdgeMutation.mutate({
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
        })
      }
    },
    [setEdges, createEdgeMutation],
  )

  const deleteEdgeMutation = useMutation({
    mutationFn: async (edgeId: string) => {
      await fetch(`/api/canvas/${canvas.id}/edges`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edgeId }),
      })
    },
  })

  const updateNodePositionMutation = useMutation({
    mutationFn: async ({
      nodeId,
      positionX,
      positionY,
    }: {
      nodeId: string
      positionX: number
      positionY: number
    }) => {
      await fetch(`/api/canvas/${canvas.id}/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionX, positionY }),
      })
    },
  })

  const addNodeMutation = useMutation({
    mutationFn: async (type: CanvasNodeType) => {
      const pos = defaultPositions[type]
      positionCounter += 1
      const offset = positionCounter * 30
      const res = await fetch(`/api/canvas/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          positionX: pos.x + offset,
          positionY: pos.y + offset,
        }),
      })
      return res.json()
    },
    onSuccess: (newNode) => {
      setNodes((nds) => [
        ...nds,
        {
          id: newNode.id,
          type: 'sdlc',
          position: { x: newNode.positionX, y: newNode.positionY },
          data: {
            canvasId: canvas.id,
            type: newNode.type,
            label: newNode.label,
            content: newNode.content,
            status: newNode.status,
            onGenerate: handleGenerate,
            onContentUpdate: handleContentUpdate,
            onShowVersions: handleShowVersions,
          } satisfies SdlcNodeData,
        },
      ])
      queryClient.invalidateQueries({
        queryKey: ['canvases', canvas.id],
      })
    },
  })

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)

      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePositionMutation.mutate({
            nodeId: change.id,
            positionX: change.position.x,
            positionY: change.position.y,
          })
        }
        if (change.type === 'remove') {
          fetch(`/api/canvas/${canvas.id}/nodes/${change.id}`, {
            method: 'DELETE',
          })
        }
      }
    },
    [onNodesChange, canvas.id, updateNodePositionMutation],
  )

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          deleteEdgeMutation.mutate(change.id)
        }
      }
      onEdgesChange(changes)
    },
    [onEdgesChange, deleteEdgeMutation],
  )

  return (
    <div className="relative h-full w-full">
      <Canvas
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={Connection}
        defaultEdgeOptions={{ type: 'animated' }}
        panOnDrag
      >
        <Controls />
        <CanvasToolbar onAddNode={(type) => addNodeMutation.mutate(type)} />
      </Canvas>

      {versionPanel && (
        <VersionPanel
          canvasId={canvas.id}
          nodeId={versionPanel.nodeId}
          nodeLabel={versionPanel.label}
          onClose={() => setVersionPanel(null)}
          onRestore={handleRestore}
        />
      )}

    </div>
  )
}

interface CanvasViewProps {
  canvas: CanvasWithNodes
}

export function CanvasView({ canvas }: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner canvas={canvas} />
    </ReactFlowProvider>
  )
}
