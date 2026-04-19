# OpenObserve Dashboard Pack

This folder contains manual-import dashboards for the local OpenObserve setup documented in `OTLP_OBSERVABILITY.md`.

## Dashboards

- `dashboards/agent-runtime-overview.dashboard.json`
- `dashboards/tool-and-mcp-performance.dashboard.json`
- `dashboards/failures-and-persistence.dashboard.json`
- `dashboards/trace-correlation-and-drilldown.dashboard.json`
- `dashboards/dashboard-generation-health.dashboard.json`
- `dashboards/local-service-health.dashboard.json`

## What These Target

The dashboards are grounded in the telemetry already emitted by the app today:

- OTLP logs in the `hashit` logs stream
- OTLP traces in the `hashit` traces stream
- log correlation fields like `trace_id`, `span_id`, `runprofile`, `runstatus`, `tracesource`
- trace attributes normalized to names like `agent_profile`, `agent_source`, `agent_status`, `dashboard_persona`, `dashboard_status`

OpenObserve normalizes many field names to lowercase or underscore-separated forms. In practice that means:

- log fields like `runProfile`, `runStatus`, `runSource`, `durationMs`, `promptTokens` land as `runprofile`, `runstatus`, `tracesource`, `durationms`, `prompttokens`
- trace attributes like `agent.profile`, `agent.source`, `dashboard.status` land as `agent_profile`, `agent_source`, `dashboard_status`

## Import Steps

1. Start the local OpenObserve service from this repo’s Docker Compose stack.
2. Open [http://localhost:5080](http://localhost:5080).
3. Sign in with the local root credentials from your `.env.local` or the defaults from `openobserve.env.example`:
   - email: `root@example.com`
   - password: `openobserve-dev-password`
4. Make sure you are in the `default` org.
5. Go to `Dashboards`.
6. Click `Import`.
7. Select one or more files from `openobserve/dashboards/`.
8. Import them into the `default` folder, or another folder if you prefer.

These dashboard files are authored in an OpenObserve-accepted `v5` dashboard schema and were validated against the local dashboard create API.

## Which One To Open First

Open these in this order the first time:

1. `agent-runtime-overview.dashboard.json`
2. `trace-correlation-and-drilldown.dashboard.json`
3. `local-service-health.dashboard.json`
4. `tool-and-mcp-performance.dashboard.json`
5. `failures-and-persistence.dashboard.json`
6. `dashboard-generation-health.dashboard.json`

That order gives you the fastest confirmation that basic logs and traces are flowing before you look for more specialized telemetry.

## Expected Streams

You should expect two OpenObserve streams with the same name but different types:

- logs stream: `hashit`
- traces stream: `hashit`

If you want to verify them before importing dashboards, check:

- `Streams` -> `logs` -> `hashit`
- `Streams` -> `traces` -> `hashit`

If you do not see those streams yet, make sure the app is running with the OTLP environment variables configured and then exercise the app with a few requests.

## What Data To Expect First

The earliest dashboards to populate are:

- `agent-runtime-overview`: basic run counts, sources, duration, and token totals
- `local-service-health`: request volume, route distribution, status breakdown, recent request timing rows
- `trace-correlation-and-drilldown`: correlated run logs and spans once both OTLP logs and traces are arriving

The slower-to-populate dashboards are:

- `tool-and-mcp-performance`: needs runs that actually invoke tools or MCP servers
- `failures-and-persistence`: needs aborted runs, stream failures, or persistence failures
- `dashboard-generation-health`: needs `dashboard.generation` spans, so it stays sparse until you generate dashboards

## Useful Smoke Test

If you want to quickly seed data for the dashboards:

1. Start the app with `pnpm dev`.
2. Open the app and send a few chat requests.
3. Trigger at least one run that uses a tool or MCP server.
4. Trigger one dashboard-generation flow if you want the dashboard-health view to light up.
5. Refresh OpenObserve and then open the imported dashboards.

## Notes

- These dashboards intentionally avoid auto-seeding and are meant for manual import.
- Some panels query fields that only appear after certain runtime paths are exercised. A panel with no rows does not necessarily mean the JSON is wrong; it may just mean that telemetry shape has not been emitted yet in your local session.
- `local-service-health` uses the request fields already present in `evlog`; its “latency” view is a recent-requests table because the generic request `duration` field lands as a string in the current log stream.
