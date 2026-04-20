import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { Chat } from '~/components/Chat'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate({ from: '/' })
  const location = useLocation()
  const newChatResetNonce =
    typeof location.state?.__newChatNavNonce === 'number'
      ? location.state.__newChatNavNonce
      : 'initial'

  // Keep rendering the home route so the active <Chat> (and its live SSE
  // stream, input state, scroll position) stays mounted.
  //
  // Route masking gives us the same UX as the old native-history bypass but
  // keeps Router and browser state in sync through official APIs:
  // - runtime route remains `/` (no remount flash)
  // - address bar shows `/chat/$threadId`
  // - reload resolves to `/chat/$threadId` via `unmaskOnReload`
  const handleThreadCreated = (threadId: string) => {
    navigate({
      to: '/',
      replace: true,
      resetScroll: false,
      state: (prev) => ({ ...(prev ?? {}), __homeMaskNonce: threadId }),
      mask: {
        to: '/chat/$threadId',
        params: { threadId },
        unmaskOnReload: true,
      },
    })
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
        <Chat key={`new-chat-${newChatResetNonce}`} onThreadCreated={handleThreadCreated} />
      </div>
    </>
  )
}
