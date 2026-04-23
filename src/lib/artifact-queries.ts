import { queryOptions } from "@tanstack/react-query";

export interface ArtifactListItem {
  id: string;
  title: string;
  spec: Record<string, unknown>;
  threadId: string | null;
  messageId: string | null;
  createdAt: string;
}

export const artifactsListQuery = queryOptions({
  queryKey: ["artifacts"] as const,
  queryFn: async ({ signal }): Promise<ArtifactListItem[]> => {
    const res = await fetch("/api/artifacts", { signal });
    if (!res.ok) throw new Error("Failed to fetch artifacts");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },
  staleTime: 30_000,
});
