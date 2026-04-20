# Paycor-DAPS-Template-UI

Repo to be used as a Template for DAPS UI App Repos.

## Multimodal prompt attachments

Users can attach images and PDFs in the prompt input. Files are uploaded to a
private Azure Blob container and the resulting capability-token URL is sent in
the multimodal `messages` payload so the agent run actually receives the
content.

### Storage

In dev, Azurite runs in `docker-compose.yml`. In production, point the
following env vars at your Azure Storage account:

| Env var                  | Default (dev)                                         | Notes                                       |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------- |
| `AZURE_BLOB_ACCOUNT_NAME`| `devstoreaccount1`                                    | Azurite default                              |
| `AZURE_BLOB_ACCOUNT_KEY` | Azurite well-known key                                | Use a real key in prod                       |
| `AZURE_BLOB_ENDPOINT`    | `http://127.0.0.1:10000/devstoreaccount1`             | Use the cloud endpoint in prod               |
| `AZURE_BLOB_CONTAINER`   | `prompt-attachments`                                  | Container is auto-created if missing         |

Constraints (enforced server-side in `src/routes/api/prompt-attachments.ts`):

- 20 MB per file, 5 files per request.
- MIME allowlist: `image/png|jpeg|webp|gif|heic`, `application/pdf`.
- Server-side magic-byte sniff (the client `Content-Type` header is not
  trusted).

The capability-token URL pattern is `/api/prompt-attachments/<id>` where `<id>`
is a 24-char `nanoid` (~143 bits of entropy). The proxy route is intentionally
unauthenticated — knowing the ID is the capability.

### Local dev caveat: vision in `hashit.localhost`

Azure OpenAI cloud cannot reach `hashit.localhost`, so an attached image will
not be loaded by the model when developing locally. To exercise vision-from-
cloud-model end-to-end in dev, expose the proxy route via a public tunnel
(e.g. `cloudflared tunnel --url https://hashit.localhost`) or test against a
deployed environment. The composer flow, upload, persistence, and reload all
work without a tunnel.
