import { createFileRoute, useNavigate } from '@tanstack/react-router'
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
  const navigate = useNavigate()

  const handleThreadCreated = (threadId: string) => {
    navigate({
      to: '/chat/$threadId',
      params: { threadId },
      replace: true,
    })
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
