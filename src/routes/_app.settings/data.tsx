import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Separator } from '~/components/ui/separator'

export const Route = createFileRoute('/_app/settings/data')({
  component: DataSettings,
})

async function exportConversations() {
  const threadsRes = await fetch('/api/threads')
  const threads: Array<{ id: string }> = await threadsRes.json()

  const full = await Promise.all(
    threads.map(async (t) => {
      const res = await fetch(`/api/threads/${t.id}`)
      return res.json()
    }),
  )

  const blob = new Blob([JSON.stringify(full, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `teammate-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function DataSettings() {
  const [deleting, setDeleting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const handleExport = () => {
    exportConversations()
  }

  const handleDeleteAll = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/threads')
      const threads: Array<{ id: string }> = await res.json()
      await Promise.all(
        threads.map((t) =>
          fetch(`/api/threads/${t.id}`, { method: 'DELETE' }),
        ),
      )
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      setDialogOpen(false)
      navigate({ to: '/' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h2 className="text-lg font-semibold">Data</h2>
        <p className="text-sm text-muted-foreground">
          Export or delete your conversation data.
        </p>
      </div>

      <Separator />

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-8 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Export conversations</h3>
            <p className="text-sm text-muted-foreground">
              Download all your conversations as a JSON file.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleExport}
          >
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
        </div>

        <div className="flex items-start justify-between gap-8 rounded-lg border border-destructive/30 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Delete all conversations</h3>
            <p className="text-sm text-muted-foreground">
              Permanently delete all conversations. This action cannot be undone.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
              >
                <Trash2Icon data-icon="inline-start" />
                Delete all
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
                  <TriangleAlertIcon className="size-5 text-destructive" />
                </div>
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all of your conversations and
                  messages. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={deleting}
                  onClick={handleDeleteAll}
                >
                  {deleting ? 'Deleting...' : 'Yes, delete everything'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
