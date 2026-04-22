# Durable Streams Production Deployment

This directory contains the runtime artifacts for the production Durable Streams service:

- `Caddyfile` - Durable Streams route and persistence config.
- `../../Dockerfile.durable-streams` - image build definition for `durable-streams-server`.

## Build and push image

Use the same Azure Container Registry as the main app:

```bash
docker build -f Dockerfile.durable-streams -t <acr-login-server>/durable-streams:<tag> .
docker push <acr-login-server>/durable-streams:<tag>
```

Set Terraform vars to match what you pushed:

- `durable_streams_image_name` (default: `durable-streams`)
- `durable_streams_image_tag` (default: `latest`)

## Terraform wiring

`infra/container-app.tf` deploys a dedicated internal Container App named `${app_name}-durable-streams` and injects:

- `DURABLE_STREAMS_URL=https://<durable-streams-app>.internal.<env-domain>/v1/stream`

into the main app container.

Durable Streams currently uses node-local writable storage in Container Apps:

- `data_dir /tmp/durable-streams/data`

This avoids a startup failure seen with Azure Files mounts (`failed to open bbolt database: permission denied`) that can leave the latest revision unhealthy and break stream writes.

## Smoke test after apply

1. `POST /api/threads` -> returns thread id.
2. `POST /api/chat?id=<threadId>` -> returns streaming response.
3. `GET /api/chat-stream?id=<threadId>&live=sse` -> emits durable updates/events.
