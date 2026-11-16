#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
season_id="$(node "$repo_root/scripts/next-publishable-season.mjs")"

if [[ -z "$season_id" ]]; then
  exit 0
fi

prompt_file="$(mktemp)"
result_file="$(mktemp)"
trap 'rm -f "$prompt_file" "$result_file"' EXIT
cat "$repo_root/automation/daily-episode.md" >"$prompt_file"
printf '\nThe deterministic preflight selected season ID `%s`. Operate only on this season.\n' "$season_id" >>"$prompt_file"

openclaw agent \
  --agent conductor \
  --session-key "agent:conductor:commander-daily-publication" \
  --message-file "$prompt_file" \
  --model openai/gpt-6-luna \
  --thinking low \
  --timeout 850 \
  --json >"$result_file"
