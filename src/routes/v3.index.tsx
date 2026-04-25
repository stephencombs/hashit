import { createFileRoute } from "@tanstack/react-router";
import { V3HomePage } from "~/features/chat-v3/ui/v3-home-page";

export const Route = createFileRoute("/v3/")({
  component: V3HomePage,
});
