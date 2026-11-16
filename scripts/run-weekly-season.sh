#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
season_key="$(node "$repo_root/scripts/verify-weekly-season.mjs" --print-key)"
result_file="$(mktemp)"
trap 'rm -f "$result_file"' EXIT

openclaw agent \
  --agent conductor \
  --session-key "agent:conductor:commander-season-${season_key}" \
  --message-file "$repo_root/automation/weekly-season.md" \
  --model openai/gpt-6-sol \
  --thinking high \
  --timeout 7000 \
  --json >"$result_file"

node "$repo_root/scripts/verify-weekly-season.mjs"
