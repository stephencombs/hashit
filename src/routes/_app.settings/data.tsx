import { createFileRoute } from "@tanstack/react-router";
import { DataSettingsPage } from "~/features/settings/ui/settings-data-page";

export const Route = createFileRoute("/_app/settings/data")({
  component: DataSettingsPage,
});
