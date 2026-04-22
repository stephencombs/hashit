import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayoutPage } from "~/features/routes/settings-layout";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayoutPage,
});
