import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import { SimulatorDatabase } from "./database.js";
import { parseForgeOutput } from "./forge.js";
import { MagicDeckSource } from "./magic-source.js";
import type { SimulatorPaths } from "./paths.js";
import { CommanderSimulatorService } from "./service.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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
  const addDeck = (id: string, name: string, generated = false) => {
    source.prepare("INSERT INTO moxfield_decks VALUES(?,?,?,?,?,?,?)").run(id, name, "commander", generated ? "local" : "public", generated ? `generated://${id}` : `https://moxfield.com/decks/${id}`, null, "2026-01-01T00:00:00Z");
    source.prepare("INSERT INTO moxfield_deck_cards VALUES(?,?,?,?,?,?,?)").run(id, "commanders", 0, `${name} Commander // Back Face`, 1, "TST", "1");
    source.prepare("INSERT INTO moxfield_deck_cards VALUES(?,?,?,?,?,?,?)").run(id, "mainboard", 1, "Forest", 99, "TST", "2");
    source.prepare("INSERT INTO moxfield_deck_tags VALUES(?,?,?)").run(id, "built", "2026-01-01T00:00:00Z");
    if (generated) {
      source.prepare("INSERT INTO moxfield_deck_tags VALUES(?,?,?)").run(id, "generated", "2026-01-01T00:00:00Z");
      source.prepare("INSERT INTO moxfield_deck_tags VALUES(?,?,?)").run(id, "not-owned", "2026-01-01T00:00:00Z");
    }
  };
  addDeck("deck-a", "Alpha");
  addDeck("deck-b", "Beta");
  addDeck("deck-c", "Gamma");
  addDeck("deck-d", "Delta");
  addDeck("gen-a", "Ash Tyrant", true);
  addDeck("gen-b", "Bog Oracle", true);
  addDeck("gen-c", "Cinder Regent", true);
  addDeck("gen-d", "Dusk Sovereign", true);
  source.close();

  const java = join(root, "fake-java");
  writeFileSync(java, `#!/bin/sh
echo 'Simulation mode'
echo 'Turn: Turn 11 (Ai(2)-Beta)'
echo 'Add Stack: Ai(2)-Beta cast Heroic Finale'
echo 'Damage: Ai(1)-Alpha takes 40 damage'
echo 'Game Outcome: Turn 11'
echo 'Game Result: Game 1 ended in 1234 ms. Ai(2)-Beta has won!'
`, { mode: 0o700 });
  chmodSync(java, 0o700);
  const paths: SimulatorPaths = {
    database: join(root, "simulator.sqlite"),
    magicDatabase: magicPath,
    java,
    forgeJar: join(root, "forge.jar"),
    forgeDirectory: root,
    deckDirectory: join(root, "decks"),
    logDirectory: join(root, "logs"),
    comicDirectory: join(root, "comics"),
  };
  mkdirSync(paths.deckDirectory, { recursive: true });
  mkdirSync(paths.logDirectory, { recursive: true });
  mkdirSync(paths.comicDirectory, { recursive: true });
  writeFileSync(paths.forgeJar, "test");
  const database = new SimulatorDatabase(paths.database);
  const magic = new MagicDeckSource(paths.magicDatabase);
  const service = new CommanderSimulatorService(database, magic, paths);
  return { database, magic, service };
}

describe("CommanderSimulatorService", () => {
  test("creates pods and reports double-faced normalization", () => {
    const { database, magic, service } = fixture();
    try {
      const pod = service.createPod({ name: "Test Pod", participants: [{ publicId: "deck-a" }, { publicId: "deck-b" }] });
      expect(pod.participants).toEqual([
        { publicId: "deck-a", persona: "Default", seat: 1 },
        { publicId: "deck-b", persona: "Default", seat: 2 },
      ]);
      expect(service.compatibility("deck-a").transformedNames[0]).toEqual({ source: "Alpha Commander // Back Face", forge: "Alpha Commander" });
    } finally {
      magic.close();
      database.close();
    }
  });

  test("runs Forge, exposes events, and records standings", async () => {
    const { database, magic, service } = fixture();
    try {
      const pod = service.createPod({ name: "Test Pod", participants: [{ publicId: "deck-a" }, { publicId: "deck-b", persona: "Reckless" }] });
      const run = await service.simulate({ podId: pod.id, games: 1, seed: 42, timeoutSeconds: 30, confirmed: true });
      expect(run.status).toBe("completed");
      expect(run.participants).toEqual(expect.arrayContaining([
        expect.objectContaining({ publicId: "deck-a", commanderNames: ["Alpha Commander // Back Face"] }),
        expect.objectContaining({ publicId: "deck-b", commanderNames: ["Beta Commander // Back Face"] }),
      ]));
      expect(run.games[0]).toMatchObject({ gameNumber: 1, winnerPublicId: "deck-b", turns: 11, durationMs: 1234, status: "completed" });
      expect(service.runLog(run.id)).toMatchObject({
        participants: expect.arrayContaining([
          expect.objectContaining({ deckName: "Alpha", commanderNames: ["Alpha Commander // Back Face"] }),
        ]),
        events: expect.arrayContaining(["Add Stack: Ai(2)-Beta cast Heroic Finale"]),
      });
      expect(service.standings().decks).toEqual(expect.arrayContaining([
        expect.objectContaining({ publicId: "deck-b", wins: 1, games: 1 }),
        expect.objectContaining({ publicId: "deck-a", losses: 1, games: 1 }),
      ]));
    } finally {
      magic.close();
      database.close();
    }
  });

  test("runs a deterministic four-deck daily game with each persona once", async () => {
    const { database, magic, service } = fixture();
    try {
      const run = await service.dailyGame({ confirmed: true, seed: 20261017, timeoutSeconds: 30 });
      expect(run.participants).toHaveLength(4);
      expect(new Set(run.participants.map(player => player.publicId)).size).toBe(4);
      expect(new Set(run.participants.map(player => player.persona))).toEqual(new Set(["Default", "Cautious", "Reckless", "Experimental"]));
      expect(service.listPods().pods).toHaveLength(1);
    } finally {
      magic.close();
      database.close();
    }
  });

  test("orchestrates a seven-game season with real heroes and generated opponents", async () => {
    const { database, magic, service } = fixture();
    try {
      const created = service.createSeason({
        confirmed: true,
        seasonKey: "2026-w44",
        title: "The Ember Crown",
        heroPublicIds: ["deck-a", "deck-b"],
        opponentPublicIds: ["gen-a", "gen-b", "gen-c", "gen-d"],
      });
      const seasonId = created.season.id;
      expect(created.cast.heroes.every((deck: any) => !deck.tags.includes("generated"))).toBe(true);
      expect(created.cast.opponents.every((deck: any) => deck.tags.includes("generated") && deck.tags.includes("not-owned"))).toBe(true);

      for (let game = 1; game <= 7; game += 1) {
        const result = await service.simulateNextSeasonGame({ seasonId, confirmed: true, timeoutSeconds: 30 });
        expect(result.stored).toBe(true);
      }
      const status = service.seasonStatus(seasonId) as any;
      expect(status.season.status).toBe("awaiting_plan");
      expect(status.games).toHaveLength(7);
      expect(status.games.slice(0, 6).map((game: any) => game.participantPublicIds.slice(2))).toEqual([
        ["gen-a", "gen-b"], ["gen-c", "gen-d"], ["gen-a", "gen-c"],
        ["gen-b", "gen-d"], ["gen-a", "gen-d"], ["gen-b", "gen-c"],
      ]);
      expect(status.games[6].participantPublicIds).toEqual(["deck-a", "deck-b", "gen-a", "gen-b"]);

      const episodes = status.games.map((game: any, index: number) => ({
        dayNumber: index + 1,
        summary: `Episode ${index + 1} adapts the stored game without changing its result.`,
        continuityGuide: "Keep all six recurring commanders visually stable throughout the weekly story. Preserve exact silhouettes, clothing, equipment, relative scale, color accents, facial features, recurring landmarks, weather progression, and all prior injuries. Generated opponents are fictional season characters and the two heroes remain protagonists even when they lose.",
        story: {
          title: `The Ember Crown · Chapter ${index + 1}`,
          premise: "Two persistent heroes confront a rotating pair of challengers while a disputed crown reshapes their alliances.",
          dramaticQuestion: "Can the heroes preserve their purpose when the factual battle turns against them?",
          personaDirections: game.run.participants.map((player: any) => ({
            deckName: player.name,
            commanderName: player.commanderNames[0],
            persona: player.persona,
            role: player.publicId.startsWith("gen-") ? "A generated rival who pressures the protagonists" : "A protagonist whose survival is not guaranteed",
            voice: "Distinct, concise, emotionally consistent, and grounded in the ongoing conflict",
          })),
        },
        pages: [1, 2, 3].map(pageNumber => ({
          pageNumber,
          title: `Chapter ${index + 1}, Movement ${pageNumber}`,
          storyBeat: `The factual confrontation advances through recorded turning point ${pageNumber} while preserving the stored winner.`,
          setting: `Episode ${index + 1} location ${pageNumber}, with a distinctive landmark, weather state, terrain profile, and camera scale.`,
          backgroundElements: [`recurring crown fragment ${pageNumber}`, `episode ${index + 1} weather marker`],
          panels: [1, 2, 3, 4].map(panel => ({
            visual: `The recurring commanders physically enact recorded battle pressure in panel ${panel}, with clear silhouettes and emotional consequences.`,
            gameplayCue: panel === 1 ? "The second seated hero visibly casts the recorded Heroic Finale while the first hero suffers the logged damage." : undefined,
            dialogue: panel === 2 ? [{ speaker: game.run.participants[1].commanderNames[0], text: "The result is ours to face." }] : [],
          })),
        })),
      }));
      const planned = service.planSeason({ seasonId, confirmed: true, episodes });
      expect(planned.season.status).toBe("ready");
      expect(planned.episodes).toHaveLength(7);
      expect(planned.episodes.every((episode: any) => episode.status === "planned")).toBe(true);

      expect(() => service.createSeason({
        confirmed: true,
        seasonKey: "bad-heroes",
        title: "Bad Heroes",
        heroPublicIds: ["gen-a", "deck-a"],
        opponentPublicIds: ["gen-b", "gen-c", "gen-d", "deck-b"],
      })).toThrow(/cannot be selected as a hero/);
    } finally {
      magic.close();
      database.close();
    }
  });

  test("rejects duplicate decks in one pod", () => {
    const { database, magic, service } = fixture();
    try {
      expect(() => service.createPod({ name: "Bad", participants: [{ publicId: "deck-a" }, { publicId: "deck-a" }] })).toThrow(/more than once/);
    } finally {
      magic.close();
      database.close();
    }
  });
});

test("Forge parser fills missing results as failures", () => {
  const games = parseForgeOutput("Game Outcome: Turn 4\nGame Result: Game 1 ended in 500 ms. Ai(1)-Alpha has won!", [{ publicId: "a" }, { publicId: "b" }], 2);
  expect(games).toEqual([
    { gameNumber: 1, winnerPublicId: "a", turns: 4, durationMs: 500, status: "completed" },
    { gameNumber: 2, status: "failed" },
  ]);
});
