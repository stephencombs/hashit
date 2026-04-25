import type { ReactNode } from "react";
import {
  ErrorComponent,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "~/shared/ui/sonner";
import { TooltipProvider } from "~/shared/ui/tooltip";
import { McpSettingsProvider } from "~/shared/hooks/use-mcp-settings";
import { ModelSettingsProvider } from "~/shared/hooks/use-model-settings";
import { ThemeProvider } from "~/shared/hooks/use-theme";

export function NotFoundPage() {
  return (
    <div className="p-8 font-[system-ui,sans-serif]">
      <h1>404 — Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/" className="text-inherit">
        Go home
      </a>
    </div>
  );
}

export function RootErrorPage({ error }: { error: Error }) {
  return (
    <RootDocument>
      <div className="p-8 font-[system-ui,sans-serif]">
        <h1>Something went wrong</h1>
        <ErrorComponent error={error} />
      </div>
    </RootDocument>
  );
}

export function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <ModelSettingsProvider>
          <McpSettingsProvider>
            <TooltipProvider>
              <HotkeysProvider
                defaultOptions={{ hotkey: { preventDefault: false } }}
              >
                <Outlet />
                {import.meta.env.DEV ? (
                  <ReactQueryDevtools initialIsOpen={false} />
                ) : null}
                <Toaster />
              </HotkeysProvider>
            </TooltipProvider>
          </McpSettingsProvider>
        </ModelSettingsProvider>
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="h-full" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex h-full flex-col">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
