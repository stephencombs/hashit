import { createFileRoute } from '@tanstack/react-router'
import { Chat } from '~/components/Chat'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'

const SILENT_PATHNAME_CHANGE_EVENT = 'hashit:silent-pathname-change'

export const Route = createFileRoute('/_app/')({
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
    window.dispatchEvent(new Event(SILENT_PATHNAME_CHANGE_EVENT))
  }

  return (
    <>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <h1 className="text-sm font-medium">New Chat</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chat onThreadCreated={handleThreadCreated} />
      </div>
    </>
  )
}
