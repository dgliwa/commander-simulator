import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("weekly season verifier", () => {
  it("does not invoke daily publication without a publishable season", () => {
    const root = mkdtempSync(join(tmpdir(), "commander-daily-"));
    roots.push(root);
    const databasePath = join(root, "simulator.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE comic_seasons(id TEXT PRIMARY KEY,status TEXT,created_at TEXT);
      CREATE TABLE season_episodes(season_id TEXT,day_number INTEGER,status TEXT);
      INSERT INTO comic_seasons VALUES('completed','completed','2026-11-01T00:00:00Z');
    `);
    database.close();

    expect(nextPublishable(databasePath).stdout).toBe("");

    const publishable = new DatabaseSync(databasePath);
    publishable.prepare("INSERT INTO comic_seasons VALUES(?,?,?)").run("ready-season", "ready", "2026-11-02T00:00:00Z");
    for (let day = 1; day <= 7; day += 1) {
      publishable.prepare("INSERT INTO season_episodes VALUES(?,?,?)").run("ready-season", day, "planned");
    }
    publishable.close();

    expect(nextPublishable(databasePath).stdout.trim()).toBe("ready-season");
  });

  it("fails closed until all seven games and episodes are durable", () => {
    const root = mkdtempSync(join(tmpdir(), "commander-weekly-"));
    roots.push(root);
    const databasePath = join(root, "simulator.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE comic_seasons(id TEXT PRIMARY KEY,season_key TEXT,title TEXT,status TEXT);
      CREATE TABLE simulation_runs(id TEXT PRIMARY KEY,status TEXT,winner_counts_json TEXT);
      CREATE TABLE season_games(season_id TEXT,game_number INTEGER,run_id TEXT);
      CREATE TABLE season_episodes(season_id TEXT,day_number INTEGER,status TEXT);
      INSERT INTO comic_seasons VALUES('season-id','season-2026-w46','Test Season','ready');
    `);
    database.close();

    const incomplete = verify(databasePath);
    expect(incomplete.status).not.toBe(0);
    expect(incomplete.stderr).toContain("0/7 stored games");

    const completed = new DatabaseSync(databasePath);
    for (let game = 1; game <= 7; game += 1) {
      completed.prepare("INSERT INTO simulation_runs VALUES(?,?,?)").run(`run-${game}`, "completed", JSON.stringify({ [`winner-${game}`]: 1 }));
      completed.prepare("INSERT INTO season_games VALUES(?,?,?)").run("season-id", game, `run-${game}`);
      completed.prepare("INSERT INTO season_episodes VALUES(?,?,?)").run("season-id", game, "planned");
    }
    completed.close();

    const valid = verify(databasePath);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("Commander season prepared");
    expect(valid.stdout).toContain("Seven simulations and seven episodes are durably stored");
  });
});

function verify(databasePath: string) {
  return runScript("verify-weekly-season.mjs", databasePath, { COMMANDER_SEASON_KEY: "season-2026-w46" });
}

function nextPublishable(databasePath: string) {
  return runScript("next-publishable-season.mjs", databasePath);
}

function runScript(script: string, databasePath: string, extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [join(process.cwd(), "scripts", script)], {
    encoding: "utf8",
    env: { ...process.env, COMMANDER_SIMULATOR_DB: databasePath, ...extraEnv },
  });
}
