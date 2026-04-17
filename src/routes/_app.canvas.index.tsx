import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, LayoutDashboardIcon, Trash2Icon } from 'lucide-react'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { canvasListQuery } from '~/lib/canvas-queries'

export const Route = createFileRoute('/_app/canvas/')({
  component: CanvasIndex,
})

function CanvasIndex() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: canvases = [] } = useQuery(canvasListQuery)

  const createCanvas = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      return res.json()
    },
    onSuccess: (canvas) => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
      navigate({ to: '/canvas/$canvasId', params: { canvasId: canvas.id } })
    },
  })

  const deleteCanvas = useMutation({
    mutationFn: async (canvasId: string) => {
      await fetch(`/api/canvas/${canvasId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
    },
  })

  return (
    <>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <h1 className="text-sm font-medium">Canvases</h1>
      </header>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-balance">SDLC Canvases</h2>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                Create and manage your product development workflows
              </p>
            </div>
            <button
              type="button"
              onClick={() => createCanvas.mutate()}
              disabled={createCanvas.isPending}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <PlusIcon className="size-4" />
              New Canvas
            </button>
          </div>

          {canvases.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <LayoutDashboardIcon className="mb-4 size-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">No canvases yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first SDLC canvas to start building
              </p>
              <button
                type="button"
                onClick={() => createCanvas.mutate()}
                disabled={createCanvas.isPending}
                className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <PlusIcon className="size-4" />
                Create Canvas
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {canvases.map((canvas) => (
                <Link
                  key={canvas.id}
                  to="/canvas/$canvasId"
                  params={{ canvasId: canvas.id }}
                  className="group relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <LayoutDashboardIcon className="size-5 text-muted-foreground" />
                      <h3 className="font-medium">{canvas.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        deleteCanvas.mutate(canvas.id)
                      }}
                      className="rounded-sm p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </div>
                  {canvas.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {canvas.description}
                    </p>
                  )}
                  <p className="mt-auto pt-3 text-xs text-muted-foreground">
                    Updated{' '}
                    {new Date(canvas.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
