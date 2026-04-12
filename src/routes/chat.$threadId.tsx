import { z } from 'zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useSuspenseQuery } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-adapter'
import { PenSquareIcon } from 'lucide-react'
import { AppSidebar } from '~/components/app-sidebar'
import { Chat } from '~/components/Chat'
import { db } from '~/db'
import { threads, messages } from '~/db/schema'
import { eq, asc } from 'drizzle-orm'
import { threadDetailQuery } from '~/lib/queries'
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

export const getThread = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(z.string()))
  .handler(async ({ data: threadId }) => {
    const thread = await db
      .select()
      .from(threads)
      .where(eq(threads.id, threadId))
      .get()

    if (!thread) {
      throw new Error('Thread not found')
    }

    const threadMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(asc(messages.createdAt))

    return { ...thread, messages: threadMessages }
  })

export const Route = createFileRoute('/chat/$threadId')({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(threadDetailQuery(params.threadId)),
  component: ChatThread,
})

function ChatThread() {
  const { threadId } = Route.useParams()
  const { data: thread } = useSuspenseQuery(threadDetailQuery(threadId))

  const initialMessages = thread.messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    parts: m.parts ?? [{ type: 'text' as const, content: m.content }],
  }))

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
                <BreadcrumbPage>{thread.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <PenSquareIcon data-icon="inline-start" />
                <span className="sr-only">New chat</span>
              </Button>
            </Link>
          </div>
        </header>
        <Chat
          key={thread.id}
          threadId={thread.id}
          initialMessages={initialMessages}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
