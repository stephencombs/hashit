import { createFileRoute } from "@tanstack/react-router";
import { AutomationsPage } from "~/features/automations/ui/automations-page";
import { automationListQuery } from "~/features/automations/data/automation-queries";

export const Route = createFileRoute("/_app/automations")({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return;
    return context.queryClient.ensureQueryData(automationListQuery);
  },
  component: AutomationsPage,
});
