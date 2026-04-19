import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js'
import type { ServerTool } from '@tanstack/ai'
import { getMCPAccessToken } from './auth'
import { MCP_SERVERS, type MCPServerConfig } from './config'
import { mcpToolToServerTool } from './tools'

interface CachedConnection {
  client: Client
  token: string
  tools: MCPTool[] | null
}

export interface GetMcpToolsOptions {
  lazy?: boolean
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
  connections.set(config.name, { client, token, tools: null })
  return client
}

async function getCachedTools(
  config: MCPServerConfig,
  client: Client,
): Promise<MCPTool[]> {
  const cached = connections.get(config.name)
  if (cached?.tools) return cached.tools

  const { tools } = await client.listTools()
  if (cached) cached.tools = tools
  return tools
}

export async function listToolsForServer(
  serverName: string,
): Promise<{ name: string; description: string }[]> {
  let token: string
  try {
    token = await getMCPAccessToken()
  } catch {
    return []
  }
  const config = MCP_SERVERS.find((s) => s.name === serverName)
  if (!config) return []

  const client = await getOrConnect(config, token)
  const tools = await getCachedTools(config, client)

  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
  }))
}

export async function getMcpTools(
  selectedServers?: string[],
  enabledTools?: Record<string, string[]>,
  options?: GetMcpToolsOptions,
): Promise<ServerTool[]> {
  let servers = MCP_SERVERS.filter((s) => s.enabled)

  if (selectedServers && selectedServers.length > 0) {
    servers = servers.filter((s) => selectedServers.includes(s.name))
  }

  if (servers.length === 0) return []

  let token: string
  try {
    token = await getMCPAccessToken()
  } catch {
    return []
  }
  const allTools: ServerTool[] = []

  const results = await Promise.allSettled(
    servers.map(async (config) => {
      const client = await getOrConnect(config, token)
      const tools = await getCachedTools(config, client)

      const allowedNames = enabledTools?.[config.name]
      const filtered = allowedNames
        ? tools.filter((t) => allowedNames.includes(t.name))
        : tools

      return filtered.map((mcpTool) =>
        mcpToolToServerTool(mcpTool, client, config, options),
      )
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

export async function getAllMcpTools(
  options?: GetMcpToolsOptions,
): Promise<ServerTool[]> {
  let token: string
  try {
    token = await getMCPAccessToken()
  } catch {
    return []
  }

  const allTools: ServerTool[] = []

  const results = await Promise.allSettled(
    MCP_SERVERS.map(async (config) => {
      const client = await getOrConnect(config, token)
      const tools = await getCachedTools(config, client)
      return tools.map((mcpTool) =>
        mcpToolToServerTool(mcpTool, client, config, options),
      )
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
