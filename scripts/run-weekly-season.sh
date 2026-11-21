#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
season_key="$(node "$repo_root/scripts/verify-weekly-season.mjs" --print-key)"
result_file="$(mktemp)"
message_file="$(mktemp)"
trap 'rm -f "$result_file" "$message_file"' EXIT

{
  printf 'Use the exact requested season key `%s`. Do not substitute the current calendar week.\n\n' "$season_key"
  cat "$repo_root/automation/weekly-season.md"
} >"$message_file"

openclaw agent \
  --agent conductor \
  --session-key "agent:conductor:commander-season-${season_key}" \
  --message-file "$message_file" \
  --model openai/gpt-6-sol \
  --thinking high \
  --timeout 7000 \
  --json >"$result_file"

COMMANDER_SEASON_KEY="$season_key" node "$repo_root/scripts/verify-weekly-season.mjs"
