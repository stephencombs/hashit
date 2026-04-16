import { toolDefinition, type Tool } from '@tanstack/ai'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CallToolResultSchema, type Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js'
import type { MCPServerConfig } from './config'

/**
 * OpenAI requires `additionalProperties: false` on every object-type node
 * and a `type` key on every property in function parameter schemas. MCP
 * servers return standard JSON Schema without these constraints. This
 * recursively patches all nodes to satisfy OpenAI strict mode.
 */
function patchSchemaForOpenAI(schema: Record<string, unknown>): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) return schema

  const patched = { ...schema }

  if ('format' in patched) {
    delete patched.format
  }

  if (Array.isArray(patched.type)) {
    const types = patched.type as string[]
    if (types.length === 2 && types.includes('null')) {
      const realType = types.find((t) => t !== 'null')!
      delete patched.type
      const { type: _ignored, ...rest } = patched
      const realSchema = patchSchemaForOpenAI({ ...rest, type: realType })
      return { anyOf: [realSchema, { type: 'null' }] }
    }
  }

  const hasComposition = patched.allOf || patched.anyOf || patched.oneOf || patched.$ref
  if (!patched.type && !hasComposition) {
    if (patched.properties) {
      patched.type = 'object'
    } else if (patched.items) {
      patched.type = 'array'
    } else {
      patched.type = 'string'
    }
  }

  if (patched.type === 'object') {
    patched.additionalProperties = false
  }

  if (patched.properties && typeof patched.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(patched.properties as Record<string, unknown>)) {
      props[key] = typeof val === 'object' && val !== null
        ? patchSchemaForOpenAI(val as Record<string, unknown>)
        : val
    }
    patched.properties = props
  }

  if (patched.items) {
    if (Array.isArray(patched.items)) {
      patched.items = patched.items.map((item: unknown) =>
        typeof item === 'object' && item !== null
          ? patchSchemaForOpenAI(item as Record<string, unknown>)
          : item,
      )
    } else if (typeof patched.items === 'object') {
      patched.items = patchSchemaForOpenAI(patched.items as Record<string, unknown>)
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(patched[keyword])) {
      patched[keyword] = (patched[keyword] as unknown[]).map((item: unknown) =>
        typeof item === 'object' && item !== null
          ? patchSchemaForOpenAI(item as Record<string, unknown>)
          : item,
      )
    }
  }

  return patched
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

const MCP_TOOL_TIMEOUT_MS = 60_000

function isOutputSchemaError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("does not match the tool's output schema")
}

async function callToolWithTimeout(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const doCall = async () => {
    try {
      return await client.callTool({ name, arguments: args })
    } catch (err) {
      if (isOutputSchemaError(err)) {
        console.warn(`[mcp] Output schema validation failed for "${name}", retrying without validation`)
        return (client as unknown as { request: (req: unknown, schema: unknown) => Promise<Awaited<ReturnType<Client['callTool']>>> })
          .request(
            { method: 'tools/call' as const, params: { name, arguments: args } },
            CallToolResultSchema,
          )
      }
      throw err
    }
  }

  return Promise.race([
    doCall(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`MCP tool "${name}" timed out after ${MCP_TOOL_TIMEOUT_MS / 1000}s`)),
        MCP_TOOL_TIMEOUT_MS,
      ),
    ),
  ])
}

function extractTextContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter(
        (block: { type?: string }) =>
          block && typeof block === 'object' && block.type === 'text',
      )
      .map((block: { text?: string }) => block.text ?? '')
      .join('\n')
  }
  if (typeof content === 'string') return content
  return JSON.stringify(content)
}

export function mcpToolToServerTool(
  mcpTool: MCPTool,
  client: Client,
  config: MCPServerConfig,
) {
  const name = sanitizeToolName(`${config.name}__${mcpTool.name}`)
  const schema = patchSchemaForOpenAI(mcpTool.inputSchema as Record<string, unknown>)

  return toolDefinition({
    name,
    description: `[${config.domain}] ${mcpTool.description ?? mcpTool.name}`,
    inputSchema: schema as Tool['inputSchema'],
  }).server(async (args: unknown) => {
    const result = await callToolWithTimeout(client, mcpTool.name, args as Record<string, unknown>)
    if (result.isError) {
      throw new Error(
        extractTextContent(result.content) || 'MCP tool execution failed',
      )
    }
    return result.structuredContent ?? extractTextContent(result.content)
  })
}
