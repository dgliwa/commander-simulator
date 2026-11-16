#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), ".openclaw");
const databasePath = process.env.COMMANDER_SIMULATOR_DB || join(stateDir, "plugins", "commander-simulator", "simulator.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });

try {
  const season = database.prepare(`
    SELECT cs.id
    FROM comic_seasons cs
    WHERE cs.status IN ('ready','publishing')
      AND (SELECT COUNT(*) FROM season_episodes se WHERE se.season_id=cs.id)=7
      AND EXISTS (
        SELECT 1 FROM season_episodes se
        WHERE se.season_id=cs.id AND se.status IN ('planned','failed','queued','running')
      )
    ORDER BY cs.created_at ASC
    LIMIT 1
  `).get();
  if (season) process.stdout.write(`${season.id}\n`);
} finally {
  database.close();
}
