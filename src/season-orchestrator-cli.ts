#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { SimulatorDatabase } from "./database.js";
import { MagicDeckSource } from "./magic-source.js";
import { resolveSimulatorPaths } from "./paths.js";
import { CommanderSimulatorService } from "./service.js";
import { oldestUnfinishedSeason, reconcileAllSeasons } from "./season-lifecycle.js";

const NEEDS_PREPARATION = 4;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stateDir = option("--state-dir") ?? process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw");
const target = option("--discord-target") ?? process.env.COMMANDER_COMIC_DISCORD_TARGET;
const openclawCommand = option("--openclaw-command") ?? process.env.OPENCLAW_COMMAND ?? "openclaw";
const paths = resolveSimulatorPaths(stateDir, {
  ...(option("--database") ? { databasePath: option("--database") } : {}),
  ...(option("--magic-database") ? { magicDatabasePath: option("--magic-database") } : {}),
  ...(option("--runtime") ? { runtimePath: option("--runtime") } : {}),
});

const reconciled = reconcileAllSeasons(paths.database, paths.magicDatabase, paths.comicDirectory);
const season = oldestUnfinishedSeason(paths.database);
if (process.argv.includes("--reconcile-only")) {
  process.stdout.write(`${JSON.stringify({ reconciled, season: season ?? null })}\n`);
} else if (!season || !["ready", "publishing"].includes(season.status)) {
  process.stdout.write(`${JSON.stringify({ reconciled, needsPreparation: true, season: season ?? null })}\n`);
  process.exitCode = NEEDS_PREPARATION;
} else {
  if (!target) throw new Error("--discord-target or COMMANDER_COMIC_DISCORD_TARGET is required to queue an artifact.");
  const database = new SimulatorDatabase(paths.database);
  const magic = new MagicDeckSource(paths.magicDatabase);
  try {
    const service = new CommanderSimulatorService(database, magic, paths, { comicDiscordTarget: target, openclawCommand });
    const publication = service.publishNextSeasonEpisode({ seasonId: season.id, confirmed: true });
    process.stdout.write(`${JSON.stringify({ reconciled, needsPreparation: false, seasonId: season.id, publication })}\n`);
  } finally {
    magic.close();
    database.close();
  }
}
