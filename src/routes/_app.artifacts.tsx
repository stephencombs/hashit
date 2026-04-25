import { createFileRoute } from "@tanstack/react-router";
import { ArtifactsPage } from "~/features/artifacts/ui/artifacts-page";
import { artifactsListQuery } from "~/features/artifacts/data/artifact-queries";

export const Route = createFileRoute("/_app/artifacts")({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return;
    return context.queryClient.ensureQueryData(artifactsListQuery);
  },
  component: ArtifactsPage,
});
