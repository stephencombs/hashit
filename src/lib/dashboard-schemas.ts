import type { Spec } from "@json-render/core";
import { z } from "zod";

export const persistedRecipeDataSourceSchema = z.object({
  toolName: z.string(),
  toolParams: z.record(z.string(), z.unknown()),
  label: z.string(),
});

export const persistedRecipeSchema = z.object({
  widgetId: z.string(),
  title: z.string(),
  insight: z.string(),
  dataSources: z.array(persistedRecipeDataSourceSchema),
  render: z.string(),
  score: z.number(),
  traceId: z.string().optional(),
  /** 0–100 composite from id / insight / source novelty (dashboard generator). */
  uniquenessScore: z.number().optional(),
  uniquenessReasons: z.array(z.string()).optional(),
});

export const persistedWidgetSchema = z.object({
  widgetId: z.string(),
  title: z.string(),
  insight: z.string(),
  spec: z.record(z.string(), z.unknown()).nullable(),
  skipReason: z.string().optional(),
  traceId: z.string().optional(),
});

export const dashboardRenderableSpecSchema = z.custom<Spec>((value) => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { root?: unknown; elements?: unknown };
  if (typeof candidate.root !== "string") return false;
  if (!candidate.elements || typeof candidate.elements !== "object")
    return false;
  if (Array.isArray(candidate.elements)) return false;
  return true;
}, "Invalid dashboard render spec");

export type PersistedRecipe = z.infer<typeof persistedRecipeSchema>;
export type PersistedWidget = z.infer<typeof persistedWidgetSchema>;

export const dashboardSnapshotWireSchema = z.object({
  id: z.string(),
  status: z.enum(["generating", "complete", "failed"]),
  persona: z.string(),
  recipes: z.array(persistedRecipeSchema).nullable(),
  widgets: z.array(persistedWidgetSchema).nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const snapshotResponseSchema = z.object({
  snapshot: dashboardSnapshotWireSchema.nullable(),
  isStale: z.boolean(),
});

export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;

export const postDashboardGenerationResultSchema = z.object({
  snapshotId: z.string(),
  status: z.enum(["started", "already_generating"]),
});

export type PostDashboardGenerationResult = z.infer<
  typeof postDashboardGenerationResultSchema
>;

export const postDashboardBodySchema = z.object({
  persona: z.string().optional(),
});

export type PostDashboardBody = z.infer<typeof postDashboardBodySchema>;

export const dashboardSnapshotSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["generating", "complete", "failed"]),
  persona: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  recipeCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});

export type DashboardSnapshotSummary = z.infer<
  typeof dashboardSnapshotSummarySchema
>;

export const dashboardHistoryResponseSchema = z.object({
  snapshots: z.array(dashboardSnapshotSummarySchema),
});

export type DashboardHistoryResponse = z.infer<
  typeof dashboardHistoryResponseSchema
>;

export const dashboardSnapshotDetailResponseSchema = z.object({
  snapshot: dashboardSnapshotWireSchema,
});

export type DashboardSnapshotDetailResponse = z.infer<
  typeof dashboardSnapshotDetailResponseSchema
>;
