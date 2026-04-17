import { useRef, useState } from 'react'
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-adapter'

import { Chat } from '~/components/Chat'
import { db } from '~/db'
import { threads, messages } from '~/db/schema'
import { eq, asc } from 'drizzle-orm'
import { threadDetailQuery, artifactsByThreadQuery } from '~/lib/queries'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'

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

function UserBubbleSkeleton({ width }: { width: string }) {
  return (
    <div className="flex w-full max-w-[95%] flex-col gap-2 ml-auto justify-end">
      <div
        className="ml-auto rounded-lg bg-secondary/60 px-4 py-3"
        style={{ width }}
      >
        <div className="h-3.5 w-full rounded bg-muted-foreground/15" />
      </div>
    </div>
  )
}

function AssistantBlockSkeleton({
  lines,
  withChart = false,
}: {
  lines: number[]
  withChart?: boolean
}) {
  return (
    <div className="flex w-full max-w-[95%] flex-col gap-3">
      <div className="flex flex-col gap-2">
        {lines.map((w, i) => (
          <div
            key={i}
            className="h-3.5 rounded bg-muted/40"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
      {withChart && (
        <div className="h-72 w-full rounded-lg border border-border/40 bg-muted/20" />
      )}
    </div>
  )
}

function ChatThreadPending() {
  return (
    <>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <div className="h-4 w-48 rounded bg-muted/50" />
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-6">
        <div className="flex flex-1 min-h-0 flex-col justify-end gap-8 overflow-hidden px-4">
          <AssistantBlockSkeleton lines={[92, 76, 88, 60]} withChart />
          <UserBubbleSkeleton width="220px" />
          <AssistantBlockSkeleton lines={[84, 95, 72]} />
          <UserBubbleSkeleton width="320px" />
          <AssistantBlockSkeleton lines={[88, 70]} />
        </div>
        <div className="mt-4 flex h-[104px] w-full flex-col rounded-lg border border-input bg-input/30 px-3 py-2">
          <div className="flex-1" />
          <div className="flex items-center justify-between">
            <div />
            <div className="h-8 w-8 rounded-md bg-muted/40" />
          </div>
        </div>
      </div>
    </>
  )
}

export const Route = createFileRoute('/_app/chat/$threadId')({
  loader: ({ params, context, abortController }) => {
    const threadKey = threadDetailQuery(params.threadId).queryKey
    const artifactsKey = artifactsByThreadQuery(params.threadId).queryKey
    abortController.signal.addEventListener('abort', () => {
      context.queryClient.cancelQueries({ queryKey: threadKey, exact: true })
      context.queryClient.cancelQueries({ queryKey: artifactsKey, exact: true })
    })
    return Promise.all([
      context.queryClient.ensureQueryData(threadDetailQuery(params.threadId)),
      context.queryClient.ensureQueryData(
        artifactsByThreadQuery(params.threadId),
      ),
    ])
  },
  component: ChatThread,
  pendingComponent: ChatThreadPending,
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
    <>
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
    </>
  )
}
