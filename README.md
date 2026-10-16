# Commander Simulator

An OpenClaw plugin for bounded, durable Magic: The Gathering Commander simulations using [Forge](https://github.com/Card-Forge/forge).

The plugin reads normalized public Moxfield deck snapshots from Magic Workspace, exports temporary Forge `.dck` files, runs Forge's headless Commander mode, and stores results in an owner-only SQLite database. Moxfield remains authoritative; simulations never write to Moxfield or Magic Workspace.

## Current scope

- Durable 2-8 player pods
- Per-seat Forge AI profiles: Default, Cautious, Reckless, Experimental
- Explicit-confirmation simulation runs
- 1-10 games per tool invocation
- Reproducible RNG seeds
- Bounded per-game and whole-process timeouts
- Per-game winner, turn count, duration, and owner-only raw logs
- Basic deck-count and transformed-card-name compatibility checks

Forge personas are heuristic profiles, not language-model roleplay personas. Richer political and strategic personas remain future work.

## Tools

- `commander_simulator_status`
- `commander_personas`
- `commander_deck_compatibility`
- `commander_pod_create`
- `commander_pod_update`
- `commander_pod_delete`
- `commander_pod_status`
- `commander_simulate`
- `commander_simulation_status`

## Runtime

The default runtime root is `~/.local/share/commander-simulator` and expects:

- `runtime/java/current/bin/java`
- `runtime/forge/current/forge-gui-desktop-2.0.15-jar-with-dependencies.jar`

Plugin data defaults to:

- `~/.openclaw/plugins/commander-simulator/simulator.sqlite`
- `~/.local/share/commander-simulator/data/decks/commander/`
- `~/.local/share/commander-simulator/data/logs/`

The Magic Workspace registry defaults to `~/.openclaw/plugins/magic-workspace/magic.sqlite`.

## Safety model

- Simulations require `confirmed: true`.
- Forge runs as a child process with fixed argument arrays, memory limits, bounded output, and timeouts.
- Deck snapshots are read from Magic Workspace using a read-only SQLite connection.
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
