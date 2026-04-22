import { createFileRoute } from "@tanstack/react-router";
import { DataSettingsPage } from "~/features/routes/settings-data-page";

export const Route = createFileRoute("/_app/settings/data")({
  component: DataSettingsPage,
});
