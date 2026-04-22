import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettingsPage } from "~/features/routes/settings-appearance-page";

export const Route = createFileRoute("/_app/settings/appearance")({
  component: AppearanceSettingsPage,
});
