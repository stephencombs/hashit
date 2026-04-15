import { memo } from 'react'
import {
  Renderer,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from '@json-render/react'
import { uiRegistry } from '~/lib/ui-registry'
import { MoreHorizontal, Bookmark, Check } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '~/components/ui/dropdown-menu'
import type { Spec } from '@json-render/core'

export const JsonRenderDisplay = memo(function JsonRenderDisplay({
  spec,
  isStreaming,
  onSaveArtifact,
  saved,
}: {
  spec: Spec
  isStreaming: boolean
  onSaveArtifact?: (spec: Spec) => void
  saved?: boolean
}) {
  if (!spec?.root || !spec?.elements) return null

  return (
    <div className="group/chart relative">
      {onSaveArtifact && (
        <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover/chart:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 bg-background/80 backdrop-blur-sm shadow-sm border border-border/50"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
              <DropdownMenuItem
                disabled={saved}
                onClick={() => onSaveArtifact(spec)}
              >
                {saved ? (
                  <Check className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {saved ? 'Saved as Artifact' : 'Save as Artifact'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <StateProvider initialState={spec.state ?? {}}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer
              spec={spec}
              registry={uiRegistry}
              loading={isStreaming}
            />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </div>
  )
})
