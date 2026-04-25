import { Component, memo, useState, type ReactNode } from "react";
import {
  Renderer,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";
import { uiRegistry, FillModeProvider } from "~/shared/lib/ui-registry";
import { MoreHorizontal, Bookmark, Check, AlertCircleIcon } from "lucide-react";
import { Button } from "~/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/shared/ui/dropdown-menu";
import type { Spec } from "@json-render/core";

class RenderErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function RenderFallback({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
      <AlertCircleIcon className="size-4" />
      <span>{message}</span>
    </div>
  );
}

export const JsonRenderDisplay = memo(function JsonRenderDisplay({
  spec,
  isStreaming,
  onSaveArtifact,
  saved,
  fill = false,
  messageId,
  specIndex,
}: {
  spec: Spec;
  isStreaming: boolean;
  onSaveArtifact?: (spec: Spec, messageId?: string, specIndex?: number) => void;
  saved?: boolean;
  fill?: boolean;
  messageId?: string;
  specIndex?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!spec?.root || !spec?.elements) {
    return <RenderFallback message="Visualization unavailable — empty spec." />;
  }
  if (!spec.elements[spec.root]) {
    return (
      <RenderFallback message="Visualization unavailable — malformed spec." />
    );
  }

  const outerClass = fill
    ? "group/chart flex h-full min-h-0 flex-col gap-1"
    : "group/chart flex flex-col gap-1";
  const innerClass = fill ? "flex flex-1 min-h-0 flex-col" : "flex flex-col";

  return (
    <div className={outerClass}>
      {onSaveArtifact && (
        <div className="flex justify-end">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild onMouseEnter={() => setMenuOpen(true)}>
              <Button variant="ghost" size="sm" className="size-8 p-0">
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
                onClick={() => {
                  onSaveArtifact(spec, messageId, specIndex);
                  setMenuOpen(false);
                }}
              >
                {saved ? (
                  <Check className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {saved ? "Saved as Artifact" : "Save as Artifact"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className={innerClass}>
        <RenderErrorBoundary
          fallback={
            <RenderFallback message="Visualization failed to render." />
          }
        >
          <FillModeProvider value={fill}>
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
          </FillModeProvider>
        </RenderErrorBoundary>
      </div>
    </div>
  );
});
