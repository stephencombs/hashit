import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, ServerIcon, WrenchIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Switch } from '~/components/ui/switch'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '~/components/ui/accordion'
import { Badge } from '~/components/ui/badge'
import { useMcpSettings } from '~/hooks/use-mcp-settings'
import {
  mcpServersQueryOptions,
  mcpToolsQueryOptions,
  type ServerInfo,
} from '~/lib/mcp-queries'
import { cn } from '~/lib/utils'

export const Route = createFileRoute('/_app/settings/mcp')({
  component: McpSettings,
})

type Tab = 'servers' | 'tools'

const TABS: { id: Tab; label: string; icon: typeof ServerIcon }[] = [
  { id: 'servers', label: 'Servers', icon: ServerIcon },
  { id: 'tools', label: 'Tools', icon: WrenchIcon },
]

function shortName(serverName: string) {
  return serverName.replace(/\.Mcp$/, '').split('.').pop()!
}

function McpSettings() {
  const queryClient = useQueryClient()
  const { selectedServers, enabledTools, toggleServer, toggleTool, toggleAllTools } =
    useMcpSettings()
  const [tab, setTab] = useState<Tab>('servers')
  const [filterDomain, setFilterDomain] = useState<string | null>(null)
  const [filterServer, setFilterServer] = useState<string | null>(null)

  useEffect(() => {
    if (filterServer && !selectedServers.includes(filterServer)) {
      setFilterServer(null)
    }
  }, [filterServer, selectedServers])

  const { data: servers = [], isLoading: serversLoading } = useQuery(
    mcpServersQueryOptions(),
  )

  const toolCountQueries = useQueries({
    queries: servers.map((s) => mcpToolsQueryOptions(s.name)),
  })

  const toolCountByServer = useMemo(() => {
    const map: Record<string, number | undefined> = {}
    servers.forEach((s, i) => {
      map[s.name] = toolCountQueries[i]?.data?.length
    })
    return map
  }, [servers, toolCountQueries])

  const selectedToolQueries = useQueries({
    queries: selectedServers.map((name) => mcpToolsQueryOptions(name)),
  })

  const serverToolsMap = useMemo(() => {
    const map: Record<string, { name: string; description: string }[]> = {}
    selectedServers.forEach((name, i) => {
      const data = selectedToolQueries[i]?.data
      if (data) map[name] = data
    })
    return map
  }, [selectedServers, selectedToolQueries])

  const grouped = useMemo(() => {
    const groups: Record<string, ServerInfo[]> = {}
    for (const server of servers) {
      ;(groups[server.domain] ??= []).push(server)
    }
    return groups
  }, [servers])

  const handleServerToggle = useCallback(
    async (serverName: string, enabled: boolean) => {
      if (enabled) {
        const tools = await queryClient.fetchQuery(
          mcpToolsQueryOptions(serverName),
        )
        toggleServer(serverName, tools.map((t) => t.name))
      } else {
        toggleServer(serverName)
      }
    },
    [toggleServer, queryClient],
  )

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h2 className="text-lg font-semibold">MCP Servers</h2>
        <p className="text-sm text-muted-foreground">
          Choose which MCP servers and tools are available during chat.
        </p>
      </div>

      <Separator />

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'servers' && (
        <div className="space-y-6">
          {serversLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading servers...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setFilterDomain(null)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filterDomain === null
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  All
                </button>
                {Object.keys(grouped).map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() =>
                      setFilterDomain(filterDomain === domain ? null : domain)
                    }
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      filterDomain === domain
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {domain}
                  </button>
                ))}
              </div>
              {Object.entries(grouped)
                .filter(([domain]) => !filterDomain || domain === filterDomain)
                .map(([domain, domainServers]) => (
                <div key={domain}>
                  <Badge variant="outline" className="mb-3">
                    {domain}
                  </Badge>
                  <div className="space-y-2">
                    {domainServers.map((server) => {
                      const on = selectedServers.includes(server.name)
                      const count = toolCountByServer[server.name]
                      return (
                        <div
                          key={server.name}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <Switch
                            checked={on}
                            onCheckedChange={(checked) =>
                              handleServerToggle(server.name, checked)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium">
                                {shortName(server.name)}
                              </span>
                              {count !== undefined && (
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  {count} tool{count === 1 ? '' : 's'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {server.description}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'tools' && (
        <div className="space-y-4">
          {selectedServers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              Enable at least one server to configure tools.
            </p>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setFilterServer(null)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    filterServer === null
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  All
                </button>
                {selectedServers.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setFilterServer(filterServer === name ? null : name)
                    }
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      filterServer === name
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {shortName(name)}
                  </button>
                ))}
              </div>
              <Accordion
                key={filterServer ?? 'all'}
                type="multiple"
                defaultValue={filterServer ? [filterServer] : []}
              >
              {(filterServer ? [filterServer] : selectedServers).map((serverName) => {
                const tools = serverToolsMap[serverName] ?? []
                const enabled = enabledTools[serverName] ?? []
                const server = servers.find((s) => s.name === serverName)
                const loading = tools.length === 0

                return (
                  <AccordionItem key={serverName} value={serverName}>
                    <AccordionTrigger>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {shortName(serverName)}
                        </span>
                        {server && (
                          <Badge variant="outline" className="text-[10px]">
                            {server.domain}
                          </Badge>
                        )}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {enabled.length}/{tools.length} enabled
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {loading ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <Loader2Icon className="size-4 animate-spin" />
                          Loading tools...
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="mb-2 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                toggleAllTools(
                                  serverName,
                                  tools.map((t) => t.name),
                                )
                              }
                            >
                              {enabled.length === tools.length
                                ? 'Deselect all'
                                : 'Select all'}
                            </Button>
                          </div>
                          {tools.map((tool) => {
                            const isOn = enabled.includes(tool.name)
                            return (
                              <label
                                key={tool.name}
                                className={cn(
                                  'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50',
                                  !isOn && 'opacity-70',
                                )}
                              >
                                <Switch
                                  size="sm"
                                  checked={isOn}
                                  onCheckedChange={() =>
                                    toggleTool(serverName, tool.name)
                                  }
                                  className="mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="break-all text-sm font-medium">
                                    {tool.name}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {tool.description}
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
            </>
          )}
        </div>
      )}
    </div>
  )
}
