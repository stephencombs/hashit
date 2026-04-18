import { queryOptions } from '@tanstack/react-query'
import {
  dashboardHistoryResponseSchema,
  dashboardSnapshotDetailResponseSchema,
  postDashboardGenerationResultSchema,
  snapshotResponseSchema,
} from '~/lib/dashboard-schemas'

export type {
  DashboardHistoryResponse,
  DashboardSnapshotDetailResponse,
  DashboardSnapshotSummary,
  PostDashboardGenerationResult,
  SnapshotResponse,
} from '~/lib/dashboard-schemas'

const DEFAULT_HISTORY_LIMIT = 20

export const DASHBOARD_POLL_INTERVAL_MS = 3000

/** Stable key prefix for invalidation: `['dashboard', 'snapshot', persona]` */
export function dashboardSnapshotQueryKey(persona: string) {
  return ['dashboard', 'snapshot', persona] as const
}

export function dashboardSnapshotQuery(persona: string) {
  return queryOptions({
    queryKey: dashboardSnapshotQueryKey(persona),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/dashboard?persona=${encodeURIComponent(persona)}`,
        { signal },
      )
      if (!res.ok) {
        throw new Error(`Dashboard snapshot failed: ${res.status}`)
      }
      return snapshotResponseSchema.parse(await res.json())
    },
    refetchInterval: (query) =>
      query.state.data?.snapshot?.status === 'generating'
        ? DASHBOARD_POLL_INTERVAL_MS
        : false,
    retry: 2,
  })
}

export async function postDashboardGeneration(
  persona: string,
  force: boolean,
) {
  const url = force
    ? `/api/dashboard?force=true`
    : '/api/dashboard'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) {
    throw new Error(`Dashboard generation request failed: ${res.status}`)
  }
  return postDashboardGenerationResultSchema.parse(await res.json())
}

/** Stable key prefix: `['dashboard', 'history', persona]` */
export function dashboardHistoryQueryKey(persona: string) {
  return ['dashboard', 'history', persona] as const
}

export function dashboardHistoryQuery(
  persona: string,
  { limit = DEFAULT_HISTORY_LIMIT }: { limit?: number } = {},
) {
  return queryOptions({
    queryKey: dashboardHistoryQueryKey(persona),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        persona,
        limit: String(limit),
      })
      const res = await fetch(`/api/dashboard/history?${params.toString()}`, {
        signal,
      })
      if (!res.ok) {
        throw new Error(`Dashboard history failed: ${res.status}`)
      }
      return dashboardHistoryResponseSchema.parse(await res.json())
    },
    retry: 2,
    staleTime: 30_000,
  })
}

/** Stable key: `['dashboard', 'snapshot-by-id', id]` */
export function dashboardSnapshotByIdQueryKey(snapshotId: string) {
  return ['dashboard', 'snapshot-by-id', snapshotId] as const
}

export function dashboardSnapshotByIdQuery(snapshotId: string | null) {
  return queryOptions({
    queryKey: dashboardSnapshotByIdQueryKey(snapshotId ?? ''),
    queryFn: async ({ signal }) => {
      if (!snapshotId) {
        throw new Error('snapshotId is required')
      }
      const res = await fetch(
        `/api/dashboard/snapshots/${encodeURIComponent(snapshotId)}`,
        { signal },
      )
      if (!res.ok) {
        throw new Error(`Dashboard snapshot failed: ${res.status}`)
      }
      return dashboardSnapshotDetailResponseSchema.parse(await res.json())
    },
    enabled: Boolean(snapshotId),
    retry: 2,
    staleTime: 60_000,
  })
}
