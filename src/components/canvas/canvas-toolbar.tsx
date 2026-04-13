import { useState } from 'react'
import {
  PlusIcon,
  FileTextIcon,
  UsersIcon,
  PaletteIcon,
  ServerIcon,
  ListChecksIcon,
} from 'lucide-react'
import { Panel } from '~/components/ai-elements/panel'
import type { CanvasNodeType } from '~/db/schema'

const nodeOptions: Array<{
  type: CanvasNodeType
  label: string
  icon: React.ReactNode
}> = [
  { type: 'prd', label: 'PRD', icon: <FileTextIcon className="size-4" /> },
  {
    type: 'user_stories',
    label: 'User Stories',
    icon: <UsersIcon className="size-4" />,
  },
  {
    type: 'uiux_spec',
    label: 'UI/UX Spec',
    icon: <PaletteIcon className="size-4" />,
  },
  {
    type: 'tech_architecture',
    label: 'Tech Architecture',
    icon: <ServerIcon className="size-4" />,
  },
  {
    type: 'task_breakdown',
    label: 'Task Breakdown',
    icon: <ListChecksIcon className="size-4" />,
  },
]

interface CanvasToolbarProps {
  onAddNode: (type: CanvasNodeType) => void
}

export function CanvasToolbar({ onAddNode }: CanvasToolbarProps) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <Panel position="top-left" className="flex items-center gap-1 overflow-visible p-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary"
        >
          <PlusIcon className="size-4" />
          Add Node
        </button>
        {showPicker && (
          <div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-md border bg-card p-1 shadow-md">
            {nodeOptions.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  onAddNode(opt.type)
                  setShowPicker(false)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary"
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
