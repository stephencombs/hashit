import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  isSpanContextValid,
  trace,
  type Attributes,
  type Context,
  type Span,
} from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions'
import { resolveOtlpHeaders, resolveTraceEndpoint } from './config'

export interface StartedSpan {
  span: Span
  context: Context
  traceId?: string
  spanId?: string
}

let provider: NodeTracerProvider | null | undefined

function resolveServiceName(): string {
  return (
    process.env.OTLP_SERVICE_NAME?.trim() ||
    process.env.OTEL_SERVICE_NAME?.trim() ||
    'hashit'
  )
}

function ensureTracerProvider(): NodeTracerProvider | null {
  if (provider !== undefined) return provider

  const endpoint = resolveTraceEndpoint()
  if (!endpoint) {
    provider = null
    return provider
  }

  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers: resolveOtlpHeaders(),
    timeoutMillis: Number(process.env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT || 10_000),
  })

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: resolveServiceName(),
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV || 'development',
    }),
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 1000,
        maxExportBatchSize: 100,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 10_000,
      }),
    ],
  })

  provider.register()
  return provider
}

function toAttributeValue(value: unknown): Attributes[string] | undefined {
  if (value == null) return undefined
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    const filtered = value.filter(
      (item): item is string | number | boolean =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    )
    return filtered.length > 0 ? filtered : undefined
  }
  return JSON.stringify(value)
}

export function toAttributes(
  values: Record<string, unknown> | undefined,
): Attributes | undefined {
  if (!values) return undefined

  const attrs: Attributes = {}
  for (const [key, value] of Object.entries(values)) {
    const attrValue = toAttributeValue(value)
    if (attrValue !== undefined) {
      attrs[key] = attrValue
    }
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined
}

export function startTraceSpan(
  name: string,
  options?: {
    parentSpan?: Span
    kind?: SpanKind
    attributes?: Record<string, unknown>
  },
): StartedSpan {
  ensureTracerProvider()

  const tracer = trace.getTracer('hashit-agent-runtime')
  const parentContext = options?.parentSpan
    ? trace.setSpan(ROOT_CONTEXT, options.parentSpan)
    : ROOT_CONTEXT
  const span = tracer.startSpan(
    name,
    {
      kind: options?.kind ?? SpanKind.INTERNAL,
      attributes: toAttributes(options?.attributes),
    },
    parentContext,
  )
  const spanContext = span.spanContext()
  const valid = isSpanContextValid(spanContext)

  return {
    span,
    context: trace.setSpan(parentContext, span),
    traceId: valid ? spanContext.traceId : undefined,
    spanId: valid ? spanContext.spanId : undefined,
  }
}

export function setTraceAttributes(
  span: Span | undefined,
  attributes: Record<string, unknown> | undefined,
) {
  if (!span || !attributes) return

  const normalized = toAttributes(attributes)
  if (normalized) {
    span.setAttributes(normalized)
  }
}

export function markTraceSuccess(
  span: Span | undefined,
  attributes?: Record<string, unknown>,
) {
  if (!span) return
  setTraceAttributes(span, attributes)
  span.setStatus({ code: SpanStatusCode.OK })
}

export function markTraceError(
  span: Span | undefined,
  error: unknown,
  attributes?: Record<string, unknown>,
) {
  if (!span) return
  if (error instanceof Error) {
    span.recordException(error)
  } else {
    span.recordException({ message: String(error) })
  }
  setTraceAttributes(span, attributes)
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  })
}

export function endTraceSpan(span: Span | undefined) {
  if (!span) return
  span.end()
}

export async function shutdownTelemetry() {
  if (!provider) return
  await provider.shutdown()
}

export async function flushTelemetry() {
  if (!provider) return
  await provider.forceFlush()
}

export function isTelemetryEnabled(): boolean {
  return !!resolveTraceEndpoint()
}

export function getActiveContext() {
  ensureTracerProvider()
  return context.active()
}
