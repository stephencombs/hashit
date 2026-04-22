-- Normalize ui-spec parts in messages.parts from the old wire format
-- { type: 'ui-spec', content: '<JSON string>' } to the new format
-- { type: 'ui-spec', spec: <parsed object>, specIndex: <number> }.
--
-- This migration is idempotent: the WHERE clause requires both 'type'='ui-spec'
-- AND the presence of the legacy 'content' key, so re-running it after the
-- column has already been normalised matches zero rows and is a no-op.
--
-- Rollback note: to undo, restore 'content' from 'spec' via:
--   UPDATE messages SET parts = (
--     SELECT jsonb_agg(
--       CASE WHEN elem->>'type' = 'ui-spec' AND elem ? 'spec'
--         THEN (elem - 'spec') || jsonb_build_object('content', (elem->'spec')::text)
--         ELSE elem END
--       ORDER BY ord
--     )
--     FROM jsonb_array_elements(parts) WITH ORDINALITY AS t(elem, ord)
--   )
--   WHERE parts IS NOT NULL
--     AND EXISTS (SELECT 1 FROM jsonb_array_elements(parts) e WHERE e->>'type' = 'ui-spec' AND e ? 'spec');

UPDATE messages
SET parts = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'type' = 'ui-spec' AND elem ? 'content' THEN
        -- Remove the 'content' string key and add a 'spec' object key parsed
        -- from the JSON value stored inside content.  Cast via ::jsonb so
        -- Postgres treats it as a structured value, not a string.
        (elem - 'content') || jsonb_build_object('spec', (elem->>'content')::jsonb)
      ELSE
        elem
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(messages.parts) WITH ORDINALITY AS t(elem, ord)
)
WHERE parts IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(messages.parts) e
    WHERE e->>'type' = 'ui-spec'
      AND e ? 'content'
  );
