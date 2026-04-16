import { useRef, useState } from 'react'
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-adapter'

import { AppSidebar } from '~/components/app-sidebar'
import { Chat } from '~/components/Chat'
import { db } from '~/db'
import { threads, messages } from '~/db/schema'
import { eq, asc } from 'drizzle-orm'
import { threadDetailQuery } from '~/lib/queries'
import { Separator } from '~/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'

export const getThread = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(z.string()))
  .handler(async ({ data: threadId }) => {
    const [thread] = await db
      .select()
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1)

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

function EditableTitle({ threadId, title }: { threadId: string; title: string }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLHeadingElement>(null)
  const queryClient = useQueryClient()

  const rename = useMutation({
    mutationFn: async (newTitle: string) => {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] })
    },
  })

  const commit = () => {
    const el = ref.current
    setEditing(false)
    if (!el) return
    const newTitle = el.textContent?.trim() ?? ''
    if (newTitle && newTitle !== title) {
      rename.mutate(newTitle)
    } else {
      el.textContent = title
    }
  }

  return (
    <h1
      ref={ref}
      className={`text-sm font-medium ${editing ? 'rounded border border-input px-1 outline-none ring-1 ring-ring' : 'cursor-text'}`}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => {
        if (editing) return
        setEditing(true)
        requestAnimationFrame(() => {
          const el = ref.current
          if (!el) return
          el.focus()
          const range = document.createRange()
          range.selectNodeContents(el)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        })
      }}
      onBlur={() => {
        if (editing) commit()
      }}
      onKeyDown={(e) => {
        if (!editing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          const el = ref.current
          if (el) el.textContent = title
          setEditing(false)
          el?.blur()
        }
      }}
    >
      {title}
    </h1>
  )
}

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
          <EditableTitle threadId={thread.id} title={thread.title} />
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
