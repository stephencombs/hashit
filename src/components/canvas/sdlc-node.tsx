import { memo, useState } from 'react'
import {
  SparklesIcon,
  HistoryIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileTextIcon,
  UsersIcon,
  PaletteIcon,
  ServerIcon,
  ListChecksIcon,
  SendIcon,
} from 'lucide-react'
import {
  Node,
  NodeHeader,
  NodeTitle,
  NodeDescription,
  NodeAction,
  NodeContent,
  NodeFooter,
} from '~/components/ai-elements/node'
import { Toolbar } from '~/components/ai-elements/toolbar'
import { MessageResponse } from '~/components/ai-elements/message'
import { cn } from '~/lib/utils'
import type { NodeProps as ReactFlowNodeProps } from '@xyflow/react'
import type { CanvasNodeType, CanvasNodeStatus } from '~/db/schema'

export interface SdlcNodeData {
  canvasId: string
  type: CanvasNodeType
  label: string
  content: Record<string, unknown> | null
  status: CanvasNodeStatus
  onGenerate: (nodeId: string, userInput?: string) => void
  onContentUpdate: (nodeId: string, content: Record<string, unknown>) => void
  onShowVersions: (nodeId: string) => void
}

const nodeTypeIcons: Record<CanvasNodeType, React.ReactNode> = {
  prd: <FileTextIcon className="size-4" />,
  user_stories: <UsersIcon className="size-4" />,
  uiux_spec: <PaletteIcon className="size-4" />,
  tech_architecture: <ServerIcon className="size-4" />,
  task_breakdown: <ListChecksIcon className="size-4" />,
}

const statusIndicator: Record<CanvasNodeStatus, React.ReactNode> = {
  idle: null,
  generating: <Loader2Icon className="size-3.5 animate-spin text-blue-500" />,
  stale: <AlertCircleIcon className="size-3.5 text-yellow-500" />,
  error: <AlertCircleIcon className="size-3.5 text-destructive" />,
}

const nodeTypeColors: Record<CanvasNodeType, string> = {
  prd: 'border-l-blue-500',
  user_stories: 'border-l-green-500',
  uiux_spec: 'border-l-purple-500',
  tech_architecture: 'border-l-orange-500',
  task_breakdown: 'border-l-cyan-500',
}

function SdlcNodeComponent({
  id,
  data,
  selected,
}: ReactFlowNodeProps & { data: SdlcNodeData }) {
  const [userInput, setUserInput] = useState('')

  const markdown = (data.content as Record<string, unknown> | null)?.markdown as string | undefined
  const hasContent = !!markdown
  const isGenerating = data.status === 'generating'
  const isPrd = data.type === 'prd'

  return (
    <>
      <Node
        handles={{ target: !isPrd, source: true }}
        className={cn(
          'flex flex-col border-l-4 transition-shadow',
          nodeTypeColors[data.type],
          selected && 'ring-2 ring-ring',
        )}
      >
        <NodeHeader>
          <div className="flex items-center gap-2">
            {nodeTypeIcons[data.type]}
            <NodeTitle className="text-sm font-semibold">
              {data.label}
            </NodeTitle>
          </div>
          <NodeDescription className="text-xs text-muted-foreground">
            {data.type.replace(/_/g, ' ')}
          </NodeDescription>
          {statusIndicator[data.status] && (
            <NodeAction>
              {statusIndicator[data.status]}
            </NodeAction>
          )}
        </NodeHeader>

        <NodeContent className="nowheel min-h-0 flex-1 overflow-y-auto p-4">
          {hasContent ? (
            <MessageResponse
              className="prose-sm text-sm"
              isAnimating={isGenerating}
            >
              {markdown}
            </MessageResponse>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {isGenerating ? 'Generating...' : 'No content yet. Generate or edit to get started.'}
            </div>
          )}
        </NodeContent>

        <NodeFooter className="flex-col gap-2">
          {isPrd && (
            <div className="flex w-full items-center gap-1.5">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && userInput.trim()) {
                    data.onGenerate(id, userInput.trim())
                    setUserInput('')
                  }
                }}
                placeholder="Describe your product idea..."
                className="nowheel h-8 flex-1 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => {
                  if (userInput.trim()) {
                    data.onGenerate(id, userInput.trim())
                    setUserInput('')
                  }
                }}
                disabled={isGenerating || !userInput.trim()}
                className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                <SendIcon className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isGenerating ? 'Generating...' : hasContent ? 'Ready' : 'Empty'}
            </span>
          </div>
        </NodeFooter>
      </Node>

      <Toolbar>
        <button
          type="button"
          onClick={() => data.onGenerate(id)}
          disabled={isGenerating}
          className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
          title="Generate with AI"
        >
          {isGenerating ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
          Generate
        </button>
        <button
          type="button"
          onClick={() => data.onShowVersions(id)}
          className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-secondary"
          title="Version History"
        >
          <HistoryIcon className="size-3.5" />
          Versions
        </button>
      </Toolbar>
    </>
  )
}

export const SdlcNode = memo(SdlcNodeComponent)
