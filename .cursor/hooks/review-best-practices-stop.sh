#!/usr/bin/env bash

# Advisory stop hook:
# asks the agent for one final best-practice review pass before completion.

cat <<'JSON'
{
  "followup_message": "Before finalizing, run a concise review of the implemented work against applicable local best-practice skills (for example files under .claude/skills and AGENTS guidance). Prioritize correctness, regressions, performance, TanStack/React patterns, and API design. If issues exist, list them by severity with concrete file paths and fixes; if none, state that explicitly with residual risks."
}
JSON
