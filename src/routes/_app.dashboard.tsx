import { createFileRoute } from "@tanstack/react-router";
import {
  DASHBOARD_PERSONA,
  DashboardPage,
} from "~/features/routes/dashboard-page";
import { dashboardSnapshotQuery } from "~/lib/dashboard-queries";

export const Route = createFileRoute("/_app/dashboard")({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return;
    return context.queryClient.ensureQueryData(
      dashboardSnapshotQuery(DASHBOARD_PERSONA),
    );
  },
  component: DashboardPage,
});
