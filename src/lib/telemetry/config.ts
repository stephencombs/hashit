function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {}

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return headers

      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      if (!key || !value) return headers

      try {
        headers[key] = decodeURIComponent(value)
      } catch {
        headers[key] = value
      }
      return headers
    }, {})
}

function normalizeSignalEndpoint(
  endpoint: string | undefined,
  signalPath: '/v1/traces' | '/v1/logs',
): string | undefined {
  if (!endpoint) return undefined
  const trimmed = trimTrailingSlash(endpoint.trim())
  if (!trimmed) return undefined
  if (trimmed.endsWith(signalPath)) return trimmed
  return `${trimmed}${signalPath}`
}

function normalizeBaseEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined
  const trimmed = trimTrailingSlash(endpoint.trim())
  return trimmed || undefined
}

function resolveOpenObserveBaseEndpoint(): string | undefined {
  const baseUrl = process.env.OPENOBSERVE_URL?.trim()
  if (!baseUrl) return undefined

  const organization = process.env.OPENOBSERVE_ORG?.trim() || 'default'
  return `${trimTrailingSlash(baseUrl)}/api/${organization}`
}

function resolveOpenObserveAuthHeader(): string | undefined {
  const email = process.env.OPENOBSERVE_ROOT_USER_EMAIL?.trim()
  const password = process.env.OPENOBSERVE_ROOT_USER_PASSWORD?.trim()
  if (!email || !password) return undefined

  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`
}

export function resolveTraceEndpoint(): string | undefined {
  return (
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    normalizeSignalEndpoint(process.env.OTLP_ENDPOINT, '/v1/traces') ||
    normalizeSignalEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT, '/v1/traces') ||
    normalizeSignalEndpoint(resolveOpenObserveBaseEndpoint(), '/v1/traces')
  )
}

export function resolveLogEndpoint(): string | undefined {
  return (
    normalizeBaseEndpoint(process.env.OTLP_ENDPOINT) ||
    normalizeBaseEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) ||
    normalizeBaseEndpoint(resolveOpenObserveBaseEndpoint())
  )
}

export function resolveOtlpHeaders(): Record<string, string> {
  const headers = {
    ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    ...parseHeaders(process.env.OTLP_HEADERS),
  }

  const openObserveAuth = resolveOpenObserveAuthHeader()
  if (openObserveAuth && !headers.Authorization && !process.env.OTLP_AUTH?.trim()) {
    headers.Authorization = openObserveAuth
  }

  if (process.env.OTLP_AUTH?.trim()) {
    headers.Authorization = process.env.OTLP_AUTH.trim()
  }

  const streamName = process.env.OPENOBSERVE_STREAM_NAME?.trim()
  if (streamName && !headers['stream-name']) {
    headers['stream-name'] = streamName
  }

  return headers
}

export function hasAnyOtlpEndpoint(): boolean {
  return !!(resolveTraceEndpoint() || resolveLogEndpoint())
}
