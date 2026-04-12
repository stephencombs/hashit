import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PenSquareIcon } from 'lucide-react'
import { AppSidebar } from '~/components/app-sidebar'
import { Chat } from '~/components/Chat'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb'
import { Button } from '~/components/ui/button'
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
          '--sidebar-width': '350px',
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
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">All Chats</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>New Chat</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" disabled>
              <PenSquareIcon data-icon="inline-start" />
              <span className="sr-only">New chat</span>
            </Button>
          </div>
        </header>
        <Chat onThreadCreated={handleThreadCreated} />
      </SidebarInset>
    </SidebarProvider>
  )
}
