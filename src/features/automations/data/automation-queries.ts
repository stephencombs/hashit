import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { selectAutomationSchema, selectAutomationRunSchema } from "../contracts/schemas";

export const automationListQuery = queryOptions({
  queryKey: ["automations"],
  queryFn: async () => {
    const res = await fetch("/api/automations");
    return z.array(selectAutomationSchema).parse(await res.json());
  },
  refetchInterval: 5000,
});

const paginatedRunsSchema = z.object({
  runs: z.array(selectAutomationRunSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export type PaginatedRuns = z.infer<typeof paginatedRunsSchema>;

export const automationRunsQuery = (automationId: string, page = 1) =>
  queryOptions({
    queryKey: ["automations", automationId, "runs", page],
    queryFn: async () => {
      const res = await fetch(
        `/api/automations/${automationId}/runs?page=${page}`,
      );
      return paginatedRunsSchema.parse(await res.json());
    },
    refetchInterval: 5000,
  });
