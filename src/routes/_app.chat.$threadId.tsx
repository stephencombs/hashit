import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/chat/$threadId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/v2/chat/$threadId",
      params,
    });
  },
  component: () => null,
});
