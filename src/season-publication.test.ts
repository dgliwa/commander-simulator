import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { projectSeason, runSeasonPublicationCli, scryfallCardUrl } from "./season-publication.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(status = "completed") {
  const root = mkdtempSync(join(tmpdir(), "commander-season-publication-"));
  roots.push(root);
  const comicRoot = join(root, "comics");
  const database = join(root, "simulator.sqlite");
  const magicDatabase = join(root, "magic.sqlite");
  const seasonId = "32389215-23f1-4169-a0cc-5859af545fe7";
  mkdirSync(join(comicRoot, "seasons", seasonId, "cover"), { recursive: true });
  const coverPath = join(comicRoot, "seasons", seasonId, "cover", "cover.png");
  writeFileSync(coverPath, "cover");
  writeFileSync(join(comicRoot, "seasons", seasonId, "cover", "manifest.json"), JSON.stringify({
    status: "completed",
    path: coverPath,
    completedAt: "2026-10-29T12:00:00.000Z",
    input: { premise: "Two heroes cross seven battlefields.", dramaticQuestion: "Who endures?" },
  }));

  const db = new DatabaseSync(database);
  db.exec(`
    CREATE TABLE comic_seasons(id TEXT PRIMARY KEY,season_key TEXT,title TEXT,status TEXT,hero_public_ids_json TEXT,opponent_public_ids_json TEXT,style_seed TEXT,created_at TEXT,updated_at TEXT,completed_at TEXT);
    CREATE TABLE season_games(season_id TEXT,game_number INTEGER,label TEXT,pod_id TEXT,run_id TEXT,participant_public_ids_json TEXT,created_at TEXT);
    CREATE TABLE season_episodes(season_id TEXT,day_number INTEGER,run_id TEXT,status TEXT,comic_json TEXT,published_at TEXT);
    CREATE TABLE simulation_games(run_id TEXT,game_number INTEGER,winner_public_id TEXT,turns INTEGER,duration_ms INTEGER,status TEXT);
  `);
  db.prepare("INSERT INTO comic_seasons VALUES(?,?,?,?,?,?,?,?,?,?)").run(
    seasonId, "2026-w44", "Ashes Over Green Meridian", status,
    JSON.stringify(["hero"]), JSON.stringify(["rival"]), "seed",
    "2026-10-20T12:00:00.000Z", "2026-10-29T12:00:00.000Z",
    status === "completed" ? "2026-10-29T12:00:00.000Z" : null,
  );
  for (let day = 1; day <= 7; day++) {
    const runId = `00000000-0000-4000-8000-${String(day).padStart(12, "0")}`;
    const runDir = join(comicRoot, runId);
    mkdirSync(runDir, { recursive: true });
    const pagePath = join(runDir, "page-1.png");
    writeFileSync(pagePath, `page ${day}`);
    const comic = {
      summary: `Match ${day} summary.`,
      story: { title: `Match ${day}` },
      pages: [{ pageNumber: 1, title: `Page ${day}`, storyBeat: `Story beat ${day}.`, panels: [{ gameplayCue: `Key play ${day}.` }] }],
    };
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify({
      runId, status: "completed", completedAt: `2026-10-${20 + day}T12:00:00.000Z`,
      rendered: [{ pageNumber: 1, path: pagePath }], input: comic,
    }));
    db.prepare("INSERT INTO season_games VALUES(?,?,?,?,?,?,?)").run(seasonId, day, `Day ${day}`, `pod-${day}`, runId, JSON.stringify(["hero", "rival"]), "2026-10-20T12:00:00.000Z");
    db.prepare("INSERT INTO season_episodes VALUES(?,?,?,?,?,?)").run(seasonId, day, runId, "published", JSON.stringify(comic), "2026-10-29T12:00:00.000Z");
    db.prepare("INSERT INTO simulation_games VALUES(?,?,?,?,?,?)").run(runId, 1, day <= 4 ? "hero" : "rival", 10 + day, 100, "completed");
  }
  db.close();

  const magic = new DatabaseSync(magicDatabase);
  magic.exec(`
    CREATE TABLE moxfield_decks(public_id TEXT PRIMARY KEY,name TEXT,format TEXT,visibility TEXT,public_url TEXT,archived_at TEXT,snapshot_refreshed_at TEXT);
    CREATE TABLE moxfield_deck_cards(public_id TEXT,board TEXT,position INTEGER,name TEXT,quantity INTEGER,set_code TEXT,collector_number TEXT);
    CREATE TABLE moxfield_deck_tags(public_id TEXT,tag TEXT);
  `);
  for (const [id, deck, commander] of [["hero", "Bard", "Bard, King of Dale"], ["rival", "Drakuseth", "Drakuseth, Maw of Flames"]]) {
    magic.prepare("INSERT INTO moxfield_decks VALUES(?,?,?,?,?,?,?)").run(id, deck, "commander", "public", `https://moxfield.com/decks/${id}`, null, "2026-10-20T12:00:00.000Z");
    magic.prepare("INSERT INTO moxfield_deck_cards VALUES(?,?,?,?,?,?,?)").run(id, "commanders", 0, commander, 1, null, null);
    magic.prepare("INSERT INTO moxfield_deck_tags VALUES(?,?)").run(id, "built");
  }
  magic.close();
  return { root, comicRoot, database, magicDatabase, seasonId };
}

describe("Commander season publication projection", () => {
  it("exports a completed season with ordered pages, records, links, and match moments", () => {
    const f = fixture();
    const projection = projectSeason(f.seasonId, f.comicRoot, f.database, f.magicDatabase);
    expect(projection.source).toEqual({ system: "commander-season", recordId: f.seasonId, version: "2026-10-29T12:00:00.000Z" });
    expect(projection.media.map((item) => item.id)).toEqual(["cover", ...Array.from({ length: 7 }, (_, index) => `match-${index + 1}-page-1`)]);
    expect(projection.fields.commanders).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Bard, King of Dale", role: "hero", games: 7, wins: 4, losses: 3, draws: 0 }),
      expect.objectContaining({ name: "Drakuseth, Maw of Flames", role: "rival", games: 7, wins: 3, losses: 4, draws: 0 }),
    ]));
    expect(projection.fields.commanders[0]?.scryfallUrl).toBe(scryfallCardUrl("Bard, King of Dale"));
    expect(projection.fields.matches[0]).toMatchObject({
      number: 1,
      title: "Match 1",
      winnerNames: ["Bard, King of Dale"],
      turns: 11,
      keyMoments: ["Key play 1.", "Story beat 1."],
    });
  });

  it("fails closed until the season is completed", () => {
    const f = fixture("publishing");
    expect(() => projectSeason(f.seasonId, f.comicRoot, f.database, f.magicDatabase)).toThrow(/not completed/);
    const stderr: string[] = [];
    expect(runSeasonPublicationCli([
      "--root", f.comicRoot, "--database", f.database, "--magic-database", f.magicDatabase, "get", f.seasonId,
    ], { stdout: () => undefined, stderr: (text) => stderr.push(text) })).toBe(1);
    expect(stderr.join("")) .toContain("not completed");
  });
});
