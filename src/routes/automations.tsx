import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import cronstrue from 'cronstrue'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  ZapIcon,
  GlobeIcon,
  MessageSquareIcon,
  CircleCheckIcon,
  CircleXIcon,
  LoaderIcon,
} from 'lucide-react'
import { AppSidebar } from '~/components/app-sidebar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { Switch } from '~/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { Textarea } from '~/components/ui/textarea'
import { automationListQuery, automationRunsQuery } from '~/lib/automation-queries'
import type { Automation, AutomationRun } from '~/lib/schemas'

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Custom', value: '__custom__' },
] as const

function cronDescription(expr: string): string {
  try {
    return cronstrue.toString(expr)
  } catch {
    return expr
  }
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '--'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const Route = createFileRoute('/automations')({
  component: AutomationsPage,
})

interface AutomationFormData {
  name: string
  type: 'chat-prompt' | 'webhook'
  cronPreset: string
  cronExpression: string
  enabled: boolean
  prompt: string
  threadId: string
  webhookUrl: string
  webhookMethod: string
  webhookBody: string
}

const emptyForm: AutomationFormData = {
  name: '',
  type: 'chat-prompt',
  cronPreset: '0 * * * *',
  cronExpression: '0 * * * *',
  enabled: true,
  prompt: '',
  threadId: '',
  webhookUrl: '',
  webhookMethod: 'POST',
  webhookBody: '',
}

function buildConfig(form: AutomationFormData): Record<string, unknown> {
  if (form.type === 'chat-prompt') {
    const config: Record<string, unknown> = { prompt: form.prompt }
    if (form.threadId) config.threadId = form.threadId
    return config
  }
  const config: Record<string, unknown> = {
    url: form.webhookUrl,
    method: form.webhookMethod,
  }
  if (form.webhookBody) {
    try {
      config.body = JSON.parse(form.webhookBody)
    } catch {
      config.body = form.webhookBody
    }
  }
  return config
}

function formFromAutomation(a: Automation): AutomationFormData {
  const cronExpr = a.cronExpression
  const preset = CRON_PRESETS.find((p) => p.value === cronExpr)
  const config = (a.config ?? {}) as Record<string, unknown>

  return {
    name: a.name,
    type: a.type as 'chat-prompt' | 'webhook',
    cronPreset: preset ? preset.value : '__custom__',
    cronExpression: cronExpr,
    enabled: a.enabled,
    prompt: (config.prompt as string) ?? '',
    threadId: (config.threadId as string) ?? '',
    webhookUrl: (config.url as string) ?? '',
    webhookMethod: (config.method as string) ?? 'POST',
    webhookBody: config.body ? JSON.stringify(config.body, null, 2) : '',
  }
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === 'success') {
    return (
      <Badge variant="secondary" className="gap-1 text-green-700 dark:text-green-400">
        <CircleCheckIcon className="size-3" />
        Success
      </Badge>
    )
  }
  if (status === 'failure') {
    return (
      <Badge variant="secondary" className="gap-1 text-red-700 dark:text-red-400">
        <CircleXIcon className="size-3" />
        Failed
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <LoaderIcon className="size-3 animate-spin" />
      Running
    </Badge>
  )
}

function formatDuration(start: Date | string, end: Date | string | null | undefined): string {
  if (!end) return '--'
  const s = typeof start === 'string' ? new Date(start) : start
  const e = typeof end === 'string' ? new Date(end) : end
  const ms = e.getTime() - s.getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function RunDetailDialog({
  run,
  onClose,
}: {
  run: AutomationRun | null
  onClose: () => void
}) {
  if (!run) return null

  const result = (run.result ?? {}) as Record<string, unknown>

  return (
    <Dialog open={!!run} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run Details</DialogTitle>
          <DialogDescription>
            {run.id}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <div className="flex items-center gap-3">
            <RunStatusBadge status={run.status} />
            <span className="text-muted-foreground">
              Duration: {formatDuration(run.startedAt, run.completedAt)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Started</p>
              <p>{formatDate(run.startedAt)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Completed</p>
              <p>{formatDate(run.completedAt)}</p>
            </div>
          </div>

          {result.error && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Error</p>
              <pre className="rounded-md bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap break-all">
                {String(result.error)}
              </pre>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Result</p>
            <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

function RunRows({ automationId }: { automationId: string }) {
  const [page, setPage] = useState(1)
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null)
  const { data } = useQuery({
    ...automationRunsQuery(automationId, page),
    placeholderData: (prev) => prev,
  })

  if (!data || data.total === 0) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="bg-muted/30 text-center text-sm text-muted-foreground">
          No runs yet
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell />
        <TableCell className="text-xs font-medium text-muted-foreground">Status</TableCell>
        <TableCell className="text-xs font-medium text-muted-foreground">Started</TableCell>
        <TableCell className="text-xs font-medium text-muted-foreground">Duration</TableCell>
        <TableCell colSpan={2} className="text-xs font-medium text-muted-foreground">Details</TableCell>
        <TableCell />
      </TableRow>
      {data.runs.map((run) => {
        const result = (run.result ?? {}) as Record<string, unknown>
        return (
          <TableRow
            key={run.id}
            className="cursor-pointer bg-muted/30"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedRun(run)
            }}
          >
            <TableCell />
            <TableCell>
              <RunStatusBadge status={run.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(run.startedAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDuration(run.startedAt, run.completedAt)}
            </TableCell>
            <TableCell colSpan={2} className="max-w-0 truncate text-xs text-muted-foreground">
              {result.error
                ? String(result.error)
                : result.data
                  ? JSON.stringify(result.data)
                  : '--'}
            </TableCell>
            <TableCell />
          </TableRow>
        )
      })}
      {data.totalPages > 1 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell colSpan={5}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {data.total} total runs
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPage((p) => p - 1)
                  }}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPage((p) => p + 1)
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          </TableCell>
          <TableCell />
        </TableRow>
      )}
      <RunDetailDialog run={selectedRun} onClose={() => setSelectedRun(null)} />
    </>
  )
}

function AutomationRow({
  automation,
  onEdit,
}: {
  automation: Automation
  onEdit: (a: Automation) => void
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const toggleEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      await fetch(`/api/automations/${automation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  const deleteAutomation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/automations/${automation.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => onEdit(automation)}
      >
        <TableCell>
          <button
            className="p-1"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>
        </TableCell>
        <TableCell className="font-medium">{automation.name}</TableCell>
        <TableCell>
          <Badge variant="outline" className="gap-1">
            {automation.type === 'chat-prompt' ? (
              <MessageSquareIcon className="size-3" />
            ) : (
              <GlobeIcon className="size-3" />
            )}
            {automation.type === 'chat-prompt' ? 'Chat Prompt' : 'Webhook'}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {cronDescription(automation.cronExpression)}
        </TableCell>
        <TableCell>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={automation.enabled}
              onCheckedChange={(checked) => toggleEnabled.mutate(checked)}
              size="sm"
            />
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDate(automation.nextRunAt)}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              deleteAutomation.mutate()
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <RunRows automationId={automation.id} />
      )}
    </>
  )
}

function AutomationDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Automation | null
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AutomationFormData>(emptyForm)

  const isEditing = !!editing

  useEffect(() => {
    if (open) {
      setForm(editing ? formFromAutomation(editing) : emptyForm)
    }
  }, [open, editing])

  const save = useMutation({
    mutationFn: async () => {
      const cronExpr =
        form.cronPreset === '__custom__'
          ? form.cronExpression
          : form.cronPreset

      const body = {
        name: form.name,
        type: form.type,
        cronExpression: cronExpr,
        config: buildConfig(form),
        enabled: form.enabled,
      }

      const url = isEditing
        ? `/api/automations/${editing.id}`
        : '/api/automations'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as Record<string, string>).error ?? 'Failed to save',
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      onOpenChange(false)
    },
  })

  const cronExpr =
    form.cronPreset === '__custom__' ? form.cronExpression : form.cronPreset

  const isValid =
    form.name.trim() !== '' &&
    cronExpr.trim() !== '' &&
    (form.type === 'chat-prompt'
      ? form.prompt.trim() !== ''
      : form.webhookUrl.trim() !== '')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Automation' : 'New Automation'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update this automation\'s settings.'
              : 'Set up a new scheduled automation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="auto-name">Name</Label>
            <Input
              id="auto-name"
              placeholder="e.g. Daily summary"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  type: val as 'chat-prompt' | 'webhook',
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat-prompt">
                  <MessageSquareIcon className="size-4" />
                  Chat Prompt
                </SelectItem>
                <SelectItem value="webhook">
                  <GlobeIcon className="size-4" />
                  Webhook
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Schedule</Label>
            <Select
              value={form.cronPreset}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  cronPreset: val as string,
                  cronExpression:
                    val === '__custom__' ? f.cronExpression : (val as string),
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.cronPreset === '__custom__' && (
              <Input
                placeholder="e.g. */15 * * * *"
                value={form.cronExpression}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    cronExpression: e.target.value,
                  }))
                }
              />
            )}
            {cronExpr && (
              <p className="text-xs text-muted-foreground">
                {cronDescription(cronExpr)}
              </p>
            )}
          </div>

          {form.type === 'chat-prompt' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="auto-prompt">Prompt</Label>
                <Textarea
                  id="auto-prompt"
                  placeholder="What should the AI do?"
                  value={form.prompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, prompt: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="auto-thread">
                  Thread ID{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="auto-thread"
                  placeholder="Leave blank for a new thread each run"
                  value={form.threadId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, threadId: e.target.value }))
                  }
                />
              </div>
            </>
          )}

          {form.type === 'webhook' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="auto-url">URL</Label>
                <Input
                  id="auto-url"
                  placeholder="https://example.com/webhook"
                  value={form.webhookUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, webhookUrl: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Method</Label>
                <Select
                  value={form.webhookMethod}
                  onValueChange={(val) =>
                    setForm((f) => ({
                      ...f,
                      webhookMethod: val as string,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="auto-body">
                  Body{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional JSON)
                  </span>
                </Label>
                <Textarea
                  id="auto-body"
                  placeholder='{"key": "value"}'
                  value={form.webhookBody}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      webhookBody: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, enabled: checked }))
              }
              size="sm"
            />
            <Label>Enabled</Label>
          </div>
        </div>

        <DialogFooter>
          {save.error && (
            <p className="mr-auto text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <Button
            onClick={() => save.mutate()}
            disabled={!isValid || save.isPending}
          >
            {save.isPending
              ? 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Create Automation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AutomationsPage() {
  const { data: automationsList = [] } = useQuery(automationListQuery)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (a: Automation) => {
    setEditing(a)
    setDialogOpen(true)
  }

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '280px' } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background p-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <h1 className="text-sm font-medium">Automations</h1>
        </header>

        <div className="flex-1 p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Automations
                </h2>
                <p className="text-sm text-muted-foreground">
                  Schedule recurring tasks to run automatically.
                </p>
              </div>
              <Button onClick={openCreate}>
                <PlusIcon className="size-4" />
                New Automation
              </Button>
            </div>

            {automationsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
                <ZapIcon className="mb-4 size-12 text-muted-foreground/40" />
                <h3 className="text-lg font-medium">No automations yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create your first automation to schedule recurring tasks like
                  chat prompts or webhooks.
                </p>
                <Button className="mt-4" onClick={openCreate}>
                  <PlusIcon className="size-4" />
                  New Automation
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border tabular-nums">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {automationsList.map((automation) => (
                      <AutomationRow
                        key={automation.id}
                        automation={automation}
                        onEdit={openEdit}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <AutomationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
