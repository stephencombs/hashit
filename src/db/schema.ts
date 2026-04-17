import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import type { MessagePart } from '@tanstack/ai'

export const threads = pgTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
})

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  parts: jsonb('parts').$type<Array<MessagePart>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export const artifacts = pgTable('artifacts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  spec: jsonb('spec').$type<Record<string, unknown>>(),
  threadId: text('thread_id').references(() => threads.id),
  messageId: text('message_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export type CanvasNodeType =
  | 'prd'
  | 'user_stories'
  | 'uiux_spec'
  | 'tech_architecture'
  | 'task_breakdown'

export type CanvasNodeStatus = 'idle' | 'generating' | 'stale' | 'error'

export const canvases = pgTable('canvases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
})

export const canvasNodes = pgTable('canvas_nodes', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvases.id),
  type: text('type').$type<CanvasNodeType>().notNull(),
  label: text('label').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>(),
  positionX: doublePrecision('position_x').notNull().default(0),
  positionY: doublePrecision('position_y').notNull().default(0),
  status: text('status').$type<CanvasNodeStatus>().notNull().default('idle'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export const canvasEdges = pgTable('canvas_edges', {
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export const nodeVersions = pgTable('node_versions', {
  id: text('id').primaryKey(),
  nodeId: text('node_id')
    .notNull()
    .references(() => canvasNodes.id),
  versionNumber: integer('version_number').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>(),
  source: text('source').$type<'user' | 'ai'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
})

export type AutomationType = 'chat-prompt' | 'webhook'
export type AutomationRunStatus = 'success' | 'failure' | 'running'

export const automations = pgTable('automations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<AutomationType>().notNull(),
  cronExpression: text('cron_expression').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'date' }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
})

export const automationRuns = pgTable('automation_runs', {
  id: text('id').primaryKey(),
  automationId: text('automation_id')
    .notNull()
    .references(() => automations.id),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  status: text('status').$type<AutomationRunStatus>().notNull(),
  result: jsonb('result').$type<Record<string, unknown>>(),
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type DashboardSnapshotStatus = 'generating' | 'complete' | 'failed'

export interface PersistedWidget {
  widgetId: string
  title: string
  insight: string
  spec: Record<string, unknown> | null
  skipReason?: string
}

export interface PersistedRecipe {
  widgetId: string
  title: string
  insight: string
  dataSources: Array<{ toolName: string; toolParams: Record<string, unknown>; label: string }>
  render: string
  score: number
}

export const dashboardSnapshots = pgTable('dashboard_snapshots', {
  id: text('id').primaryKey(),
  persona: text('persona').notNull(),
  status: text('status').$type<DashboardSnapshotStatus>().notNull().default('generating'),
  recipes: jsonb('recipes').$type<PersistedRecipe[]>(),
  widgets: jsonb('widgets').$type<PersistedWidget[]>(),
  previousWidgetIds: jsonb('previous_widget_ids').$type<string[]>(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
})
