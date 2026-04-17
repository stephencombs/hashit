import { createFileRoute } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'
import { Chat } from '~/components/Chat'
import { Separator } from '~/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  // Update the URL in place so the active <Chat> (and its live SSE stream,
  // input state, scroll position) stays mounted.
  //
  // We deliberately bypass TanStack Router by invoking the native
  // `History.prototype.replaceState` directly. The router monkey-patches
  // `window.history.replaceState` on this instance and notifies its
  // subscribers on every call, which would re-match the URL, trigger the
  // `/chat/$threadId` route's Suspense boundary (briefly showing the
  // pending skeleton), and remount <Chat> — exactly the flash we want to
  // avoid. The prototype method is untouched by the patch, so calling it
  // via `.call(history, ...)` updates the URL silently. A page reload
  // still resolves to the correct `/chat/$threadId` route.
  const handleThreadCreated = (threadId: string) => {
    if (typeof window === 'undefined') return
    History.prototype.replaceState.call(
      window.history,
      null,
      '',
      `/chat/${threadId}`,
    )
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '280px',
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <h1 className="text-sm font-medium">New Chat</h1>
        </header>
        <Chat onThreadCreated={handleThreadCreated} />
      </SidebarInset>
    </SidebarProvider>
  )
}
