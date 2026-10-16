import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { SimulatorDatabase } from "./database.js";
import { runForge } from "./forge.js";
import { MagicDeckSource } from "./magic-source.js";
import type { SimulatorPaths } from "./paths.js";
import { FORGE_PERSONAS, type ForgePersona, type PodParticipant } from "./types.js";

export class CommanderSimulatorService {
  constructor(
    private readonly database: SimulatorDatabase,
    private readonly magic: MagicDeckSource,
    private readonly paths: SimulatorPaths,
  ) {}

  personas() {
    return {
      personas: [
        { name: "Default", description: "Forge's balanced baseline AI profile." },
        { name: "Cautious", description: "More conservative combat and resource decisions." },
        { name: "Reckless", description: "More aggressive attacks and willingness to trade." },
        { name: "Experimental", description: "Forge's experimental AI behavior profile." },
      ],
      note: "Forge personas adjust heuristic settings; they are not language-model roleplay personas.",
    };
  }

  builtDecks() {
    return { decks: this.magic.listBuilt() };
  }

  createPod(input: { name: string; participants: Array<{ publicId: string; persona?: ForgePersona }> }) {
    const participants = validateParticipants(input.participants);
    for (const player of participants) this.assertBuilt(player.publicId);
    return this.database.createPod(cleanName(input.name), participants);
  }

  updatePod(id: string, input: { name?: string; participants?: Array<{ publicId: string; persona?: ForgePersona }> }) {
    const participants = input.participants ? validateParticipants(input.participants) : undefined;
    if (participants) for (const player of participants) this.assertBuilt(player.publicId);
    return this.database.updatePod(id, { name: input.name === undefined ? undefined : cleanName(input.name), participants });
  }

  deletePod(id: string) {
    return this.database.deletePod(id);
  }

  listPods() {
    return { pods: this.database.listPods() };
  }

  getPod(id: string) {
    return this.database.getPod(id);
  }

  compatibility(publicId: string) {
    return this.magic.compatibility(publicId);
  }

  async simulate(input: { podId: string; games?: number; seed?: number; timeoutSeconds?: number; confirmed: boolean }) {
    if (!input.confirmed) throw new Error("Simulation requires confirmed=true because it starts a bounded Forge process and writes durable results.");
    const pod = this.database.getPod(input.podId);
    const games = integer(input.games ?? 1, 1, 10, "games");
    const timeoutSeconds = integer(input.timeoutSeconds ?? 120, 10, 300, "timeoutSeconds");
    const seed = input.seed === undefined ? randomInt(1, 2_147_483_647) : integer(input.seed, 0, 2_147_483_647, "seed");
    const participants = pod.participants.map(participant => ({ ...participant, ...this.assertBuilt(participant.publicId) })).map(item => ({
      publicId: item.publicId,
      persona: item.persona,
      seat: item.seat,
      name: item.name,
      deck: {
        publicId: item.publicId,
        name: item.name,
        format: item.format,
        visibility: item.visibility,
        publicUrl: item.publicUrl,
        archivedAt: item.archivedAt,
        snapshotRefreshedAt: item.snapshotRefreshedAt,
        tags: item.tags,
        cards: item.cards,
      },
    }));
    for (const participant of participants) {
      const report = this.magic.compatibility(participant.publicId);
      if (report.warnings.some(warning => warning.includes("archived") || warning.includes("no cached"))) throw new Error(`${participant.name} is not simulation-ready: ${report.warnings.join(" ")}`);
    }
    const id = randomUUID();
    const logPath = join(this.paths.logDirectory, `${id}.log`);
    this.database.startRun({
      id,
      podId: pod.id,
      requestedGames: games,
      seed,
      timeoutSeconds,
      participants: participants.map(({ publicId, persona, seat, name }) => ({ publicId, persona, seat, name })),
      logPath,
    });
    try {
      const result = await runForge(this.paths, participants, games, seed, timeoutSeconds, logPath);
      const parseError = result.games.some(game => game.status === "failed") ? "Forge did not produce a complete result for every requested game. Inspect the owner-only log." : undefined;
      return this.database.finishRun(id, result.games, result.error ?? parseError);
    } catch (error) {
      return this.database.finishRun(id, [], error instanceof Error ? error.message : String(error));
    }
  }

  listRuns(limit = 25) {
    return { runs: this.database.listRuns(integer(limit, 1, 100, "limit")) };
  }

  getRun(id: string) {
    return this.database.getRun(id);
  }

  runLog(id: string, offset = 0, limit = 300) {
    const run = this.database.getRun(id);
    const logRoot = resolve(this.paths.logDirectory);
    const logPath = resolve(run.logPath);
    const rel = relative(logRoot, logPath);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Simulation log path is outside the managed log directory.");
    const lines = readFileSync(logPath, "utf8").split(/\r?\n/);
    const prefixes = [
      "Simulation mode", "Ai(", "Mulligan:", "Turn:", "Land:", "Add Stack:", "Add To Stack:",
      "Resolve Stack:", "Combat:", "Damage:", "Life:", "Zone Change:", "Player Control:",
      "Game Outcome:", "Match Result:", "Game Result:",
    ];
    const events = lines.filter(line => prefixes.some(prefix => line.startsWith(prefix)));
    const safeOffset = integer(offset, 0, Math.max(events.length, 0), "offset");
    const safeLimit = integer(limit, 1, 500, "limit");
    return {
      runId: id,
      totalEvents: events.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: safeOffset + safeLimit < events.length,
      events: events.slice(safeOffset, safeOffset + safeLimit),
    };
  }

  standings() {
    const deckPersonas = this.database.standings().deckPersonas;
    return {
      deckPersonas,
      decks: aggregateStandings(deckPersonas, entry => `${entry.publicId}\u0000${entry.deckName}`, ([publicId, deckName]) => ({ publicId, deckName })),
      personas: aggregateStandings(deckPersonas, entry => entry.persona, ([persona]) => ({ persona })),
    };
  }

  async dailyGame(input: { confirmed: true; seed?: number; timeoutSeconds?: number }) {
    const seed = input.seed === undefined ? dailySeed() : integer(input.seed, 0, 2_147_483_647, "seed");
    const decks = this.magic.listBuilt();
    if (decks.length < 4) throw new Error("At least four active built decks are required for the daily Commander game.");
    const selected = shuffle(decks, seed).slice(0, 4);
    const personas = shuffle([...FORGE_PERSONAS], seed ^ 0x5f3759df);
    const participants = selected.map((deck, index) => ({ publicId: deck.publicId, persona: personas[index] }));
    const name = "Daily Commander Game";
    const existing = this.database.listPods().find(pod => pod.name === name);
    const pod = existing
      ? this.updatePod(existing.id, { participants })
      : this.createPod({ name, participants });
    return this.simulate({ podId: pod.id, games: 1, seed, timeoutSeconds: input.timeoutSeconds ?? 180, confirmed: true });
  }

  status() {
    return {
      ...this.database.summary(),
      builtDecks: this.magic.listBuilt().length,
      forge: { java: this.paths.java, jar: this.paths.forgeJar, deckDirectory: this.paths.deckDirectory },
      limits: { players: "2-8", gamesPerInvocation: "1-10", perGameTimeoutSeconds: "10-300" },
    };
  }

  private assertBuilt(publicId: string) {
    const deck = this.magic.get(publicId);
    if (!deck.tags.includes("built")) throw new Error(`${deck.name} is not tagged built in Magic Workspace.`);
    return deck;
  }
}

function aggregateStandings(
  entries: Array<{ games: number; wins: number; losses: number; draws: number; [key: string]: unknown }>,
  keyOf: (entry: any) => string,
  identity: (parts: string[]) => Record<string, string>,
) {
  const totals = new Map<string, any>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const current = totals.get(key) ?? { ...identity(key.split("\u0000")), games: 0, wins: 0, losses: 0, draws: 0 };
    current.games += entry.games;
    current.wins += entry.wins;
    current.losses += entry.losses;
    current.draws += entry.draws;
    totals.set(key, current);
  }
  return [...totals.values()].map(item => ({ ...item, winRate: item.games ? item.wins / item.games : 0 }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || String(a.deckName ?? a.persona).localeCompare(String(b.deckName ?? b.persona)));
}

function shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0 || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function dailySeed(): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(`${value.year}${value.month}${value.day}`);
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Pod name is required.");
  return name;
}

function validateParticipants(input: Array<{ publicId: string; persona?: ForgePersona }>): PodParticipant[] {
  if (input.length < 2 || input.length > 8) throw new Error("Commander pods require 2-8 participants.");
  const seen = new Set<string>();
  return input.map((participant, index) => {
    const publicId = participant.publicId.trim();
    if (!publicId) throw new Error("Every participant needs a Magic Workspace publicId.");
    if (seen.has(publicId)) throw new Error(`Deck ${publicId} appears more than once in the pod.`);
    seen.add(publicId);
    const persona = participant.persona ?? "Default";
    if (!(FORGE_PERSONAS as readonly string[]).includes(persona)) throw new Error(`Unsupported Forge persona: ${persona}`);
    return { publicId, persona, seat: index + 1 };
  });
}

function integer(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
