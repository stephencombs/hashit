import { createFileRoute } from "@tanstack/react-router";
import { ModelSettingsPage } from "~/features/settings/ui/settings-model-page";

export const Route = createFileRoute("/_app/settings/model")({
  component: ModelSettingsPage,
});
