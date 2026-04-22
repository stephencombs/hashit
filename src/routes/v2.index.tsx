import { createFileRoute } from "@tanstack/react-router";
import { V2HomePage } from "~/features/routes/v2-home-page";

export const Route = createFileRoute("/v2/")({
  component: V2HomePage,
});
