/// <reference types="vite/client" />
import { type ReactNode, useEffect } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  ErrorComponent,
} from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { evlogErrorHandler } from 'evlog/nitro/v3'
import { TooltipProvider } from '~/components/ui/tooltip'
import appCss from '~/app.css?url'

export const Route = createRootRoute({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
})

function NotFoundComponent() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>404 — Page not found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/" style={{ color: 'inherit' }}>
        Go home
      </a>
    </div>
  )
}

function RootErrorComponent({ error }: { error: Error }) {
  useEffect(() => {
    console.error('Unhandled error caught by root boundary', error)
  }, [error])

  return (
    <RootDocument>
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Something went wrong</h1>
        <ErrorComponent error={error} />
      </div>
    </RootDocument>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="h-full">
      <head>
        <HeadContent />
      </head>
      <body className="flex h-full flex-col">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
