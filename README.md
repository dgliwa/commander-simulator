# Commander Simulator

An OpenClaw plugin for bounded, durable Magic: The Gathering Commander simulations using [Forge](https://github.com/Card-Forge/forge).

The plugin reads normalized public Moxfield deck snapshots from Magic Workspace, exports temporary Forge `.dck` files, runs Forge's headless Commander mode, and stores results in an owner-only SQLite database. Only active decks carrying the local `built` tag are eligible for pods. Moxfield remains authoritative; simulations never write to Moxfield or Magic Workspace.

## Current scope

- Durable 2-8 player pods
- Per-seat Forge AI profiles: Default, Cautious, Reckless, Experimental
- Explicit-confirmation simulation runs
- 1-10 games per tool invocation
- Reproducible RNG seeds
- Bounded per-game and whole-process timeouts
- Per-game winner, turn count, duration, and owner-only full move logs
- Bounded event-log reading for storytelling and review
- Durable standings by deck, persona, and deck-persona pairing
- Deterministic daily four-deck selection with each persona assigned once
- Durable seven-day comic seasons with two owned heroes and four generated/not-owned opponents
- Six round-robin four-player games plus a seventh top-opponent finale
- Stored seven-episode plans bound to factual simulation runs
- One locked art direction and continuity bible across all season episodes
- Deterministic sequential comic rendering through the headless OpenClaw image CLI
- Resumable page generation with validated owner-only PNGs and a durable prompt manifest
- Commander-led comic narration with subtle in-world tapping, mana, casting, graveyard, exile, and command references—without scoreboards or game UI
- Direct summary-and-image delivery to a fixed configured Discord channel
- Basic deck-count and transformed-card-name compatibility checks

Forge personas are heuristic profiles, not language-model roleplay personas. Richer political and strategic personas remain future work.

## Season automation

- `automation/weekly-season.md` prepares or resumes the current week: four validated generated decks, two owned heroes, seven factual games, a complete stored arc, and an automatically rendered Discord cover.
- `automation/daily-episode.md` ensures the cover is delivered before reconciling and queueing at most one stored episode, without polling or rerunning games.
- Weekly generated decks remain in Magic Workspace with `generated`, `not-owned`, `built`, and season provenance tags.

## Tools

- `commander_simulator_status`
- `commander_personas`
- `commander_deck_list`
- `commander_deck_compatibility`
- `commander_pod_create`
- `commander_pod_update`
- `commander_pod_delete`
- `commander_pod_status`
- `commander_simulate`
- `commander_season_create`
- `commander_season_simulate_next`
- `commander_season_plan`
- `commander_season_publish_next`
- `commander_season_status`
- `commander_daily_game`
- `commander_run_log`
- `commander_standings`
- `commander_comic_publish`
- `commander_comic_status`
- `commander_simulation_status`

## Runtime

The default runtime root is `~/.local/share/commander-simulator` and expects:

- `runtime/java/current/bin/java`
- `runtime/forge/current/forge-gui-desktop-2.0.15-jar-with-dependencies.jar`

Plugin data defaults to:

- `~/.openclaw/plugins/commander-simulator/simulator.sqlite`
- `~/.local/share/commander-simulator/data/decks/commander/`
- `~/.local/share/commander-simulator/data/logs/`
- `~/.local/share/commander-simulator/data/comics/<run-id>/`

The Magic Workspace registry defaults to `~/.openclaw/plugins/magic-workspace/magic.sqlite`.

Configure `comicDiscordTarget` as a fixed `channel:<Discord channel ID>` before using `commander_comic_publish`. The tool validates a structured story plan, panel beats, concise dialogue, persona voices, and a repeated continuity guide, then queues an owner-only detached publisher and returns immediately. The publisher calls `openclaw infer image generate` sequentially, skips already valid 1024×1536 PNG pages, records durable page-level status, and sends the summary plus successful pages directly after rendering settles. Normal agent flows must not poll; `commander_comic_status` is for explicit inspection and recovery.

## Safety model

- Simulations require `confirmed: true`.
- Forge runs as a child process with fixed argument arrays, memory limits, bounded output, and timeouts.
- Deck snapshots are read from Magic Workspace using a read-only SQLite connection.
- Season heroes must be real `built` decks without `generated` or `not-owned`; season opponents must carry both provenance tags.
- Runtime files, logs, exported decks, and SQLite state are owner-only.
- No remote writes or purchases are possible.
- Results are playtest evidence, not authoritative deck power ratings; Forge AI is weaker with politics, control, and combo lines.

## Development

```bash
npm install --ignore-scripts
npm test
npm run plugin:validate
npm audit --omit=dev
```
