# OTLP Observability

This project exports two correlated telemetry lanes:

- `evlog` wide events over OTLP logs
- OpenTelemetry spans over OTLP traces

## Environment variables

There are now two supported local setup styles.

### Generic OTLP

```bash
OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=hashit
```

Authentication can be configured with either:

```bash
OTLP_HEADERS=Authorization=Bearer your-token
```

or:

```bash
OTLP_AUTH=Bearer your-token
```

### Local OpenObserve

For the Docker Compose service added in this repo, the easiest local setup is to put these in `.env.local`:

```bash
OPENOBSERVE_URL=http://localhost:5080
OPENOBSERVE_ORG=default
OPENOBSERVE_ROOT_USER_EMAIL=root@example.com
OPENOBSERVE_ROOT_USER_PASSWORD=openobserve-dev-password
OPENOBSERVE_STREAM_NAME=hashit
OTEL_SERVICE_NAME=hashit
```

You can copy the values from `openobserve.env.example`.

When these are set, the app derives:

- logs base endpoint: `http://localhost:5080/api/default`
- traces endpoint: `http://localhost:5080/api/default/v1/traces`
- auth header: `Authorization: Basic <base64(email:password)>`

The difference is intentional:

- `evlog`'s OTLP log adapter expects a base URL and appends `/v1/logs`
- the OpenTelemetry trace exporter expects the full traces signal URL

The trace exporter also respects standard OTEL variables:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`
- `OTEL_SERVICE_NAME`

## What gets exported

### Wide events

`evlog` wide events are exported through `server/plugins/evlog-drain.ts`.

Important correlation fields:

- `traceId`
- `spanId`
- `runProfile`
- `runSource`
- `runStatus`

### Trace spans

Root and child spans are created in:

- `src/lib/agent-runner.ts`
- `src/lib/chat-helpers.ts`
- `server/lib/dashboard-generator.ts`

Primary span names:

- `agent.run`
- `agent.iteration`
- `agent.tool`
- `agent.persistence`
- `dashboard.generation`

## Persisted correlation

Trace IDs are persisted in:

- `messages.metadata`
- `automation_runs.result`
- dashboard `recipes` / `widgets`

This repo intentionally stores compact correlation IDs and summaries, not full raw traces.

## Local testing

For a local collector, point `OTLP_ENDPOINT` at an OTLP HTTP receiver such as:

```bash
OTLP_ENDPOINT=http://localhost:4318
```

For local OpenObserve, use the `OPENOBSERVE_*` variables above instead of manually building the OTLP URL and Basic auth header.

Then run:

```bash
pnpm eval:agent-runtime
pnpm build
```

## Where to look

- Logs: your OTLP log backend receiving `evlog` records
- Traces: your OTLP trace backend receiving OpenTelemetry spans
- App persistence: message metadata, automation run results, and dashboard snapshot payloads
