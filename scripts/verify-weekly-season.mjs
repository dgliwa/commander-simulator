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

const seasonKey = process.env.COMMANDER_SEASON_KEY || isoWeekKey();
if (process.argv.includes("--print-key")) {
  process.stdout.write(`${seasonKey}\n`);
  process.exit(0);
}

const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), ".openclaw");
const databasePath = process.env.COMMANDER_SIMULATOR_DB || join(stateDir, "plugins", "commander-simulator", "simulator.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });

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
  if (!["ready", "publishing", "completed"].includes(String(season.status))) {
    throw new Error(`${seasonKey} is persisted with incomplete status ${season.status}.`);
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
