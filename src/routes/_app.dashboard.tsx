import { createFileRoute } from "@tanstack/react-router";
import {
  DASHBOARD_PERSONA,
  DashboardPage,
} from "~/features/dashboard/ui/dashboard-page";
import { dashboardSnapshotQuery } from "~/features/dashboard/data/dashboard-queries";

export const Route = createFileRoute("/_app/dashboard")({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return;
    return context.queryClient.ensureQueryData(
      dashboardSnapshotQuery(DASHBOARD_PERSONA),
    );
  },
  component: DashboardPage,
});
