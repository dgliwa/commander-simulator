#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${COMMANDER_COMIC_DISCORD_TARGET:-}"
if [[ -z "$target" ]]; then
  target="$(openclaw config get plugins.entries.commander-simulator.config --json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("comicDiscordTarget", ""))')"
fi
if [[ ! "$target" =~ ^channel:[0-9]{10,30}$ ]]; then
  echo "Commander comic Discord target is missing or invalid." >&2
  exit 1
fi

run_orchestrator() {
  node "$repo_root/dist/season-orchestrator-cli.js" --discord-target "$target"
}

set +e
run_orchestrator
status=$?
set -e

if [[ "$status" -eq 4 ]]; then
  "$repo_root/scripts/run-weekly-season.sh"
  run_orchestrator
elif [[ "$status" -ne 0 ]]; then
  exit "$status"
fi
