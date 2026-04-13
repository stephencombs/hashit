import { z } from 'zod'
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod'
import { canvases, canvasNodes, canvasEdges, nodeVersions } from '~/db/schema'

const coercedDate = z.coerce.date()

export const selectCanvasSchema = createSelectSchema(canvases, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  deletedAt: coercedDate.nullable(),
  pinnedAt: coercedDate.nullable(),
})
export const insertCanvasSchema = createInsertSchema(canvases)

export const selectCanvasNodeSchema = createSelectSchema(canvasNodes, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
})
export const insertCanvasNodeSchema = createInsertSchema(canvasNodes)

export const selectCanvasEdgeSchema = createSelectSchema(canvasEdges, {
  createdAt: coercedDate,
})
export const insertCanvasEdgeSchema = createInsertSchema(canvasEdges)

export const selectNodeVersionSchema = createSelectSchema(nodeVersions, {
  createdAt: coercedDate,
})
export const insertNodeVersionSchema = createInsertSchema(nodeVersions)

export const canvasNodeTypes = [
  'prd',
  'user_stories',
  'uiux_spec',
  'tech_architecture',
  'task_breakdown',
] as const

export const canvasNodeTypeSchema = z.enum(canvasNodeTypes)

export const canvasWithNodesSchema = selectCanvasSchema.extend({
  nodes: z.array(selectCanvasNodeSchema),
  edges: z.array(selectCanvasEdgeSchema),
})

export const createCanvasBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
})

export const createNodeBodySchema = z.object({
  type: canvasNodeTypeSchema,
  label: z.string().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
})

export const updateNodeBodySchema = z.object({
  content: z.record(z.string(), z.any()).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  label: z.string().optional(),
  status: z.enum(['idle', 'generating', 'stale', 'error']).optional(),
})

export const createEdgeBodySchema = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
})

export type Canvas = z.infer<typeof selectCanvasSchema>
export type CanvasNode = z.infer<typeof selectCanvasNodeSchema>
export type CanvasEdge = z.infer<typeof selectCanvasEdgeSchema>
export type NodeVersion = z.infer<typeof selectNodeVersionSchema>
export type CanvasWithNodes = z.infer<typeof canvasWithNodesSchema>
