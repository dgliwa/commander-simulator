#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function chicagoDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function isoWeekKey(now = new Date()) {
  const { year, month, day } = chicagoDateParts(now);
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `season-${isoYear}-w${String(week).padStart(2, "0")}`;
}

function nextIsoWeekKey(seasonKey) {
  const match = /^season-(\d{4})-w(\d{2})$/.exec(seasonKey);
  if (!match) throw new Error(`Invalid season key: ${seasonKey}.`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const december28 = new Date(Date.UTC(year, 11, 28));
  const weekday = december28.getUTCDay() || 7;
  december28.setUTCDate(december28.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(december28.getUTCFullYear(), 0, 1));
  const weeksInYear = Math.ceil((((december28 - yearStart) / 86_400_000) + 1) / 7);
  return week < weeksInYear
    ? `season-${year}-w${String(week + 1).padStart(2, "0")}`
    : `season-${year + 1}-w01`;
}

function nextAvailableSeasonKey(database, startingKey) {
  let seasonKey = startingKey;
  for (let offset = 0; offset < 520; offset += 1) {
    const season = database.prepare("SELECT status FROM comic_seasons WHERE season_key=?").get(seasonKey);
    if (!season || String(season.status) !== "completed") return seasonKey;
    seasonKey = nextIsoWeekKey(seasonKey);
  }
  throw new Error("Could not find an available Commander season key.");
}

const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), ".openclaw");
const databasePath = process.env.COMMANDER_SIMULATOR_DB || join(stateDir, "plugins", "commander-simulator", "simulator.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });
const requestedSeasonKey = process.env.COMMANDER_SEASON_KEY || isoWeekKey();
const seasonKey = process.argv.includes("--print-key")
  ? nextAvailableSeasonKey(database, requestedSeasonKey)
  : requestedSeasonKey;

if (process.argv.includes("--print-key")) {
  process.stdout.write(`${seasonKey}\n`);
  database.close();
  process.exit(0);
}

try {
  const season = database.prepare("SELECT id,title,status FROM comic_seasons WHERE season_key=?").get(seasonKey);
  if (!season) throw new Error(`No persisted season exists for ${seasonKey}.`);

  const games = database.prepare(`
    SELECT sg.game_number,sr.status,sr.winner_counts_json
    FROM season_games sg
    JOIN simulation_runs sr ON sr.id=sg.run_id
    WHERE sg.season_id=?
    ORDER BY sg.game_number
  `).all(season.id);
  const episodes = database.prepare("SELECT day_number,status FROM season_episodes WHERE season_id=? ORDER BY day_number").all(season.id);

  if (games.length !== 7) throw new Error(`${seasonKey} has ${games.length}/7 stored games.`);
  const incompleteGames = games.filter(game => !["completed", "completed_with_errors"].includes(String(game.status)));
  if (incompleteGames.length) throw new Error(`${seasonKey} has incomplete games: ${incompleteGames.map(game => game.game_number).join(", ")}.`);
  if (episodes.length !== 7) throw new Error(`${seasonKey} has ${episodes.length}/7 planned episodes.`);
  if (!episodes.every(episode => ["planned", "queued", "running", "published"].includes(String(episode.status)))) {
    throw new Error(`${seasonKey} contains a failed or invalid episode state.`);
  }
  if (!["ready", "publishing"].includes(String(season.status))) {
    throw new Error(`${seasonKey} is not publishable because its status is ${season.status}.`);
  }

  const winners = games.map(game => {
    const counts = JSON.parse(String(game.winner_counts_json));
    return Object.entries(counts).sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || "draw";
  });
  process.stdout.write([
    `✅ Commander season prepared: **${season.title}** (${seasonKey})`,
    `Seven simulations and seven episodes are durably stored.`,
    `Winners: ${winners.join(" · ")}`,
    `Daily publication may proceed.`,
  ].join("\n") + "\n");
} finally {
  database.close();
}
