import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import type { MessagePart } from '@tanstack/ai'

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  source: text('source'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  pinnedAt: integer('pinned_at', { mode: 'timestamp' }),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  parts: text('parts', { mode: 'json' }).$type<Array<MessagePart>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  spec: text('spec', { mode: 'json' }).$type<Record<string, unknown>>(),
  threadId: text('thread_id').references(() => threads.id),
  messageId: text('message_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type CanvasNodeType =
  | 'prd'
  | 'user_stories'
  | 'uiux_spec'
  | 'tech_architecture'
  | 'task_breakdown'

export type CanvasNodeStatus = 'idle' | 'generating' | 'stale' | 'error'

export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  pinnedAt: integer('pinned_at', { mode: 'timestamp' }),
})

export const canvasNodes = sqliteTable('canvas_nodes', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvases.id),
  type: text('type').$type<CanvasNodeType>().notNull(),
  label: text('label').notNull(),
  content: text('content', { mode: 'json' }).$type<Record<string, unknown>>(),
  positionX: real('position_x').notNull().default(0),
  positionY: real('position_y').notNull().default(0),
  status: text('status').$type<CanvasNodeStatus>().notNull().default('idle'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const canvasEdges = sqliteTable('canvas_edges', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvases.id),
  sourceNodeId: text('source_node_id')
    .notNull()
    .references(() => canvasNodes.id),
  targetNodeId: text('target_node_id')
    .notNull()
    .references(() => canvasNodes.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const nodeVersions = sqliteTable('node_versions', {
  id: text('id').primaryKey(),
  nodeId: text('node_id')
    .notNull()
    .references(() => canvasNodes.id),
  versionNumber: integer('version_number').notNull(),
  content: text('content', { mode: 'json' }).$type<Record<string, unknown>>(),
  source: text('source').$type<'user' | 'ai'>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type AutomationType = 'chat-prompt' | 'webhook'
export type AutomationRunStatus = 'success' | 'failure' | 'running'

export const automations = sqliteTable('automations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<AutomationType>().notNull(),
  cronExpression: text('cron_expression').notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey(),
  automationId: text('automation_id')
    .notNull()
    .references(() => automations.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').$type<AutomationRunStatus>().notNull(),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
