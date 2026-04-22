/// <reference types="vite/client" />
import { createRootRouteWithContext } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { evlogErrorHandler } from "evlog/nitro/v3";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "~/app.css?url";
import {
  NotFoundPage,
  RootComponent,
  RootErrorPage,
} from "~/features/routes/root-route-components";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Teammate" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [
      {
        children:
          '(function(){try{var t=localStorage.getItem("hashit-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()',
      },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorPage,
  notFoundComponent: NotFoundPage,
});
