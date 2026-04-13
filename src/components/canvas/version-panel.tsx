import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { XIcon, RotateCcwIcon, SparklesIcon, UserIcon } from 'lucide-react'
import { nodeVersionsQuery } from '~/lib/canvas-queries'
import { cn } from '~/lib/utils'

interface VersionPanelProps {
  canvasId: string
  nodeId: string
  nodeLabel: string
  onClose: () => void
  onRestore: (nodeId: string, content: Record<string, unknown>) => void
}

export function VersionPanel({
  canvasId,
  nodeId,
  nodeLabel,
  onClose,
  onRestore,
}: VersionPanelProps) {
  const queryClient = useQueryClient()
  const { data: versions = [], isLoading } = useQuery(
    nodeVersionsQuery(canvasId, nodeId),
  )

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(
        `/api/canvas/${canvasId}/nodes/${nodeId}/versions/${versionId}/restore`,
        { method: 'POST' },
      )
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['canvases', canvasId],
      })
      queryClient.invalidateQueries({
        queryKey: ['canvases', canvasId, 'nodes', nodeId, 'versions'],
      })
      if (data.content) {
        onRestore(nodeId, data.content)
      }
    },
  })

  return (
    <div className="absolute top-0 right-0 z-50 flex h-full w-80 flex-col border-l bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Version History</h3>
          <p className="text-xs text-muted-foreground">{nodeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 hover:bg-secondary"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No versions yet
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={cn(
                  'flex items-center justify-between rounded-md border p-3',
                  index === 0 && 'border-primary/30 bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2">
                  {version.source === 'ai' ? (
                    <SparklesIcon className="size-3.5 text-blue-500" />
                  ) : (
                    <UserIcon className="size-3.5 text-muted-foreground" />
                  )}
                  <div>
                    <span className="text-xs font-medium">
                      v{version.versionNumber}
                    </span>
                    <span className="mx-1 text-xs text-muted-foreground">
                      {version.source}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => restoreMutation.mutate(version.id)}
                    disabled={restoreMutation.isPending}
                    className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                    title="Restore this version"
                  >
                    <RotateCcwIcon className="size-3" />
                    Restore
                  </button>
                )}
                {index === 0 && (
                  <span className="text-xs text-muted-foreground">Current</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
