import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Keep intent-preloaded data valid for the whole time the user is
    // likely to move their cursor from a link to clicking it (and then
    // some) so hover → click is a guaranteed cache hit, no refetch.
    defaultPreloadStaleTime: 60_000,
    // Only show pending fallbacks for slow loaders. Warm navigations
    // (cache hits / prefetched) complete within a microtask, so this
    // prevents the pendingComponent from flashing on every click.
    defaultPendingMs: 400,
    defaultPendingMinMs: 250,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
