import { createFileRoute } from "@tanstack/react-router";
import { V2HomePage } from "~/features/chat-v2/ui/v2-home-page";

export const Route = createFileRoute("/v2/")({
  component: V2HomePage,
});
