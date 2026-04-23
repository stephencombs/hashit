import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "~/features/routes/app-layout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
