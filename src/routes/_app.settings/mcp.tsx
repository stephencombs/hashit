import { createFileRoute } from '@tanstack/react-router'
import { McpSettingsPage } from '~/features/routes/settings-mcp-page'

export const Route = createFileRoute('/_app/settings/mcp')({
  component: McpSettingsPage,
})
