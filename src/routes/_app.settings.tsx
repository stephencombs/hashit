import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayoutPage } from "~/features/settings/ui/settings-layout";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayoutPage,
});
