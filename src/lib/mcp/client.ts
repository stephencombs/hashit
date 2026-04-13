import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ServerTool } from '@tanstack/ai'
import { getMCPAccessToken } from './auth'
import { MCP_SERVERS, type MCPServerConfig } from './config'
import { mcpToolToServerTool } from './tools'

interface CachedConnection {
  client: Client
  token: string
}

const connections = new Map<string, CachedConnection>()

async function getOrConnect(
  config: MCPServerConfig,
  token: string,
): Promise<Client> {
  const existing = connections.get(config.name)
  if (existing && existing.token === token) {
    return existing.client
  }

  if (existing) {
    await existing.client.close().catch(() => {})
    connections.delete(config.name)
  }

  const client = new Client({
    name: 'hashit',
    version: '1.0.0',
  })

  const transport = new StreamableHTTPClientTransport(
    new URL(config.baseUrl),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  )

  await client.connect(transport)
  connections.set(config.name, { client, token })
  return client
}

export async function listToolsForServer(
  serverName: string,
): Promise<{ name: string; description: string }[]> {
  const token = await getMCPAccessToken()
  const config = MCP_SERVERS.find((s) => s.name === serverName)
  if (!config) return []

  const client = await getOrConnect(config, token)
  const { tools } = await client.listTools()

  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
  }))
}

export async function getMcpTools(
  selectedServers?: string[],
  enabledTools?: Record<string, string[]>,
): Promise<ServerTool[]> {
  let servers = MCP_SERVERS.filter((s) => s.enabled)

  if (selectedServers && selectedServers.length > 0) {
    servers = servers.filter((s) => selectedServers.includes(s.name))
  }

  if (servers.length === 0) return []

  const token = await getMCPAccessToken()
  const allTools: ServerTool[] = []

  const results = await Promise.allSettled(
    servers.map(async (config) => {
      const client = await getOrConnect(config, token)
      const { tools } = await client.listTools()

      const allowedNames = enabledTools?.[config.name]
      const filtered = allowedNames
        ? tools.filter((t) => allowedNames.includes(t.name))
        : tools

      return filtered.map((mcpTool) => mcpToolToServerTool(mcpTool, client, config))
    }),
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTools.push(...result.value)
    } else {
      console.error(
        '[mcp] Failed to connect:',
        result.reason instanceof Error
          ? result.reason.message
          : result.reason,
      )
    }
  }

  return allTools
}
