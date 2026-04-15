import { memo, useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

  if (!spec?.root || !spec?.elements) return null

  return (
    <div className="group/chart flex flex-col gap-1">
      {onSaveArtifact && (
        <div className="flex justify-end">
          <DropdownMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
          >
            <DropdownMenuTrigger
              asChild
              onMouseEnter={() => setMenuOpen(true)}
            >
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-auto whitespace-nowrap"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <DropdownMenuItem
                disabled={saved}
                onClick={() => { onSaveArtifact(spec); setMenuOpen(false) }}
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
