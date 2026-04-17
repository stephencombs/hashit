import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'
import { db } from '~/db'
import { canvases, canvasNodes, canvasEdges } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { canvasDetailQuery } from '~/lib/canvas-queries'
import { CanvasView } from '~/components/canvas/canvas-view'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'

export const getCanvas = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(z.string()))
  .handler(async ({ data: canvasId }) => {
    const [canvas] = await db
      .select()
      .from(canvases)
      .where(eq(canvases.id, canvasId))
      .limit(1)

    if (!canvas) {
      throw new Error('Canvas not found')
    }

    const nodes = await db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.canvasId, canvasId))

    const edges = await db
      .select()
      .from(canvasEdges)
      .where(eq(canvasEdges.canvasId, canvasId))

    return { ...canvas, nodes, edges }
  })

export const Route = createFileRoute('/canvas/$canvasId')({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(canvasDetailQuery(params.canvasId)),
  component: CanvasPage,
})

function EditableCanvasTitle({
  canvasId,
  title,
}: {
  canvasId: string
  title: string
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLHeadingElement>(null)
  const queryClient = useQueryClient()

  const rename = useMutation({
    mutationFn: async (newTitle: string) => {
      await fetch(`/api/canvas/${canvasId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
      queryClient.invalidateQueries({ queryKey: ['canvases', canvasId] })
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

function CanvasPage() {
  const { canvasId } = Route.useParams()
  const { data: canvas } = useSuspenseQuery(canvasDetailQuery(canvasId))

  return (
    <>
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <EditableCanvasTitle canvasId={canvas.id} title={canvas.title} />
      </header>
      <div className="flex-1">
        <CanvasView key={canvas.id} canvas={canvas} />
      </div>
    </>
  )
}
