# V2 Chat Server Persistence

V2 chat now uses a stream-first persistence model:

1. `POST /api/v2/chat` writes user + assistant chunks to Durable Stream with `mode: "await"`.
2. After durable write completion, the route projects the stream snapshot into Postgres via `stream-projection.ts`.
3. The route appends terminal custom events (`thread_title_updated`, `persistence_complete`) after projection.

Legacy middleware orchestration in `persistence.ts` was removed in favor of
`persistence-runtime.ts` + `stream-projection.ts`.

## Invariants

- Durable Stream is the runtime source of truth for writes.
- `v2_messages` inserts are idempotent by message ID.
- `v2_threads.resumeOffset` tracks durable replay position.
- `v2_threads.updatedAt` and title updates happen during projection.
