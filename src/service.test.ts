import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import { SimulatorDatabase } from "./database.js";
import { parseForgeOutput } from "./forge.js";
import { MagicDeckSource } from "./magic-source.js";
import { CommanderSimulatorService } from "./service.js";
import type { SimulatorPaths } from "./paths.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "commander-simulator-"));
  roots.push(root);
  const magicPath = join(root, "magic.sqlite");
  const source = new DatabaseSync(magicPath);
  source.exec(`
    CREATE TABLE moxfield_decks(public_id TEXT PRIMARY KEY,name TEXT,format TEXT,visibility TEXT,public_url TEXT,archived_at TEXT,snapshot_refreshed_at TEXT);
    CREATE TABLE moxfield_deck_cards(public_id TEXT,board TEXT,position INTEGER,name TEXT,quantity INTEGER,set_code TEXT,collector_number TEXT);
    CREATE TABLE moxfield_deck_tags(public_id TEXT,tag TEXT,created_at TEXT,PRIMARY KEY(public_id,tag));
  `);
  const addDeck = (id: string, name: string) => {
    source.prepare("INSERT INTO moxfield_decks VALUES(?,?,?,?,?,?,?)").run(id, name, "commander", "public", `https://moxfield.com/decks/${id}`, null, "2026-01-01T00:00:00Z");
    source.prepare("INSERT INTO moxfield_deck_cards VALUES(?,?,?,?,?,?,?)").run(id, "commanders", 0, `${name} Commander // Back Face`, 1, "TST", "1");
    source.prepare("INSERT INTO moxfield_deck_cards VALUES(?,?,?,?,?,?,?)").run(id, "mainboard", 0, "Forest", 99, "TST", "2");
    source.prepare("INSERT INTO moxfield_deck_tags VALUES(?,?,?)").run(id, "built", "2026-01-01T00:00:00Z");
  };
  addDeck("deck-a", "Alpha");
  addDeck("deck-b", "Beta");
  source.close();

  const forgeDirectory = join(root, "forge");
  const deckDirectory = join(root, "decks");
  const logDirectory = join(root, "logs");
  mkdirSync(forgeDirectory);
  mkdirSync(deckDirectory);
  mkdirSync(logDirectory);
  const java = join(root, "fake-java");
  writeFileSync(java, `#!/bin/sh\necho 'Simulation mode'\necho 'Game Outcome: Turn 11'\necho 'Game Result: Game 1 ended in 1234 ms. Ai(2)-Beta has won!'\n`);
  chmodSync(java, 0o700);
  const forgeJar = join(forgeDirectory, "forge.jar");
  writeFileSync(forgeJar, "fixture");
  const paths: SimulatorPaths = { database: join(root, "simulator.sqlite"), magicDatabase: magicPath, java, forgeJar, forgeDirectory, deckDirectory, logDirectory };
  const database = new SimulatorDatabase(paths.database);
  const magic = new MagicDeckSource(paths.magicDatabase);
  const service = new CommanderSimulatorService(database, magic, paths);
  return { root, database, magic, service };
}

describe("CommanderSimulatorService", () => {
  test("creates a pod and reports double-faced name normalization", () => {
    const { database, magic, service } = fixture();
    try {
      const pod = service.createPod({ name: "Test Pod", participants: [{ publicId: "deck-a", persona: "Cautious" }, { publicId: "deck-b" }] });
      expect(pod.participants).toEqual([
        { publicId: "deck-a", persona: "Cautious", seat: 1 },
        { publicId: "deck-b", persona: "Default", seat: 2 },
      ]);
      expect(service.compatibility("deck-a").transformedNames[0]).toEqual({ source: "Alpha Commander // Back Face", forge: "Alpha Commander" });
    } finally { magic.close(); database.close(); }
  });

  test("runs Forge and durably records a winner", async () => {
    const { database, magic, service } = fixture();
    try {
      const pod = service.createPod({ name: "Test Pod", participants: [{ publicId: "deck-a" }, { publicId: "deck-b", persona: "Reckless" }] });
      const run = await service.simulate({ podId: pod.id, games: 1, seed: 42, timeoutSeconds: 30, confirmed: true });
      expect(run.status).toBe("completed");
      expect(run.games[0]).toMatchObject({ gameNumber: 1, winnerPublicId: "deck-b", turns: 11, durationMs: 1234, status: "completed" });
      expect(run.winnerCounts).toEqual({ "deck-b": 1 });
      expect(service.getRun(run.id).seed).toBe(42);
    } finally { magic.close(); database.close(); }
  });

  test("rejects duplicate decks in one pod", () => {
    const { database, magic, service } = fixture();
    try {
      expect(() => service.createPod({ name: "Bad", participants: [{ publicId: "deck-a" }, { publicId: "deck-a" }] })).toThrow(/more than once/);
    } finally { magic.close(); database.close(); }
  });
});

test("Forge parser fills missing results as failures", () => {
  const games = parseForgeOutput("Game Outcome: Turn 4\nGame Result: Game 1 ended in 500 ms. Ai(1)-Alpha has won!", [{ publicId: "a" }, { publicId: "b" }], 2);
  expect(games).toEqual([
    { gameNumber: 1, winnerPublicId: "a", turns: 4, durationMs: 500, status: "completed" },
    { gameNumber: 2, status: "failed" },
  ]);
});
