import { createFileRoute } from "@tanstack/react-router";
import { AutomationsPage } from "~/features/routes/automations-page";
import { automationListQuery } from "~/lib/automation-queries";

export const Route = createFileRoute("/_app/automations")({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return;
    return context.queryClient.ensureQueryData(automationListQuery);
  },
  component: AutomationsPage,
});
