import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { SimulatorDatabase } from "./database.js";
import { MagicDeckSource } from "./magic-source.js";
import { resolveSimulatorPaths } from "./paths.js";
import { CommanderSimulatorService } from "./service.js";
import { FORGE_PERSONAS } from "./types.js";

const id = Type.String({ minLength: 1, maxLength: 200 });
const persona = Type.Union(FORGE_PERSONAS.map(value => Type.Literal(value)));
const participant = Type.Object({ publicId: id, persona: Type.Optional(persona) }, { additionalProperties: false });
const comicDialogue = Type.Object({
  speaker: Type.String({ minLength: 1, maxLength: 100 }),
  text: Type.String({ minLength: 1, maxLength: 120 }),
}, { additionalProperties: false });
const comicPanel = Type.Object({
  visual: Type.String({ minLength: 20, maxLength: 3_000 }),
  gameplayCue: Type.Optional(Type.String({
    minLength: 10,
    maxLength: 500,
    description: "A factual event from the persisted game log translated into a clearly visible diegetic action. At least one panel per page must supply this.",
  })),
  caption: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  dialogue: Type.Optional(Type.Array(comicDialogue, { maxItems: 2, default: [] })),
}, { additionalProperties: false });
const comicPage = Type.Object({
  pageNumber: Type.Integer({ minimum: 1, maximum: 4 }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  storyBeat: Type.String({ minLength: 20, maxLength: 2_000 }),
  setting: Type.String({
    minLength: 20,
    maxLength: 1_000,
    description: "A concrete, visually distinctive setting. Across the comic, use at least two visibly different locations, environmental states, or scales.",
  }),
  backgroundElements: Type.Array(Type.String({ minLength: 3, maxLength: 300 }), {
    minItems: 2,
    maxItems: 4,
    description: "Specific landmarks, props, weather, crowds, or environmental changes that must remain visible rather than generic scenery.",
  }),
  panels: Type.Array(comicPanel, { minItems: 4, maxItems: 6 }),
}, { additionalProperties: false });
const comicPersonaDirection = Type.Object({
  deckName: Type.String({ minLength: 1, maxLength: 300, description: "Internal deck reference; do not use as an acting character in the comic." }),
  commanderName: Type.String({ minLength: 1, maxLength: 300, description: "Exact commander name used for comic agency, captions, and dialogue attribution." }),
  persona,
  role: Type.String({ minLength: 3, maxLength: 500 }),
  voice: Type.String({ minLength: 3, maxLength: 500 }),
}, { additionalProperties: false });
const comicStory = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  premise: Type.String({ minLength: 20, maxLength: 2_000 }),
  dramaticQuestion: Type.String({ minLength: 10, maxLength: 1_000 }),
  personaDirections: Type.Array(comicPersonaDirection, { minItems: 2, maxItems: 8 }),
pages: Type.Optional(Type.Array(comicPage, { minItems: 3, maxItems: 4, description: "Accepted for recovery from older nested comic plans; top-level pages are preferred." })),
}, { additionalProperties: false });
const seasonEpisode = Type.Object({
  dayNumber: Type.Integer({ minimum: 1, maximum: 7 }),
  summary: Type.String({ minLength: 1, maxLength: 8_000 }),
  continuityGuide: Type.String({ minLength: 200, maxLength: 12_000 }),
  story: comicStory,
  pages: Type.Array(comicPage, { minItems: 3, maxItems: 4 }),
}, { additionalProperties: false });

async function withService<T>(api: any, config: Record<string, unknown>, operation: (service: CommanderSimulatorService) => T | Promise<T>): Promise<T> {
  const stateDir = api.runtime.state.resolveStateDir(process.env);
  const paths = resolveSimulatorPaths(stateDir, config);
  const database = new SimulatorDatabase(paths.database);
  const magic = new MagicDeckSource(paths.magicDatabase);
  try {
    return await operation(new CommanderSimulatorService(database, magic, paths, {
      comicDiscordTarget: typeof config.comicDiscordTarget === "string" ? config.comicDiscordTarget : undefined,
      openclawCommand: typeof config.openclawCommand === "string" ? config.openclawCommand : undefined,
    }));
  } finally {
    magic.close();
    database.close();
  }
}

export default defineToolPlugin({
  id: "commander-simulator",
  name: "Commander Simulator",
  description: "Run bounded Forge Commander AI simulations using authoritative Magic Workspace deck snapshots and durable local results.",
  configSchema: Type.Object({
    databasePath: Type.Optional(Type.String({ description: "Absolute or OpenClaw-state-relative simulator SQLite path." })),
    magicDatabasePath: Type.Optional(Type.String({ description: "Absolute or OpenClaw-state-relative Magic Workspace SQLite path." })),
    runtimePath: Type.Optional(Type.String({ description: "Commander Simulator runtime root containing Forge and Java." })),
    javaPath: Type.Optional(Type.String({ description: "Override path to the Java executable." })),
    forgeJarPath: Type.Optional(Type.String({ description: "Override path to the Forge desktop jar." })),
    comicDiscordTarget: Type.Optional(Type.String({ pattern: "^channel:[0-9]{10,30}$", description: "Fixed Discord channel target for rendered daily comics." })),
    openclawCommand: Type.Optional(Type.String({ minLength: 1, maxLength: 500, description: "OpenClaw CLI command used by the deterministic comic renderer." })),
  }, { additionalProperties: false }),
  tools: tool => [
    tool({
      name: "commander_simulator_status",
      description: "Show Forge runtime paths, safety limits, and durable simulation counts.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.status()); },
    }),
    tool({
      name: "commander_personas",
      description: "List the built-in Forge AI profiles available as simulation personas.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.personas()); },
    }),
    tool({
      name: "commander_deck_list",
      description: "List active Magic Workspace decks tagged built and therefore eligible for Commander simulation pods.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.builtDecks()); },
    }),
    tool({
      name: "commander_deck_compatibility",
      description: "Inspect one cached Magic Workspace deck for basic Forge Commander compatibility and name normalization warnings.",
      parameters: Type.Object({ publicId: id }, { additionalProperties: false }),
      execute: async ({ publicId }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.compatibility(publicId)); },
    }),
    tool({
      name: "commander_pod_create",
      description: "Create a durable 2-8 player Commander pod from Magic Workspace deck public IDs and optional Forge personas. This does not start a game.",
      parameters: Type.Object({ name: Type.String({ minLength: 1, maxLength: 300 }), participants: Type.Array(participant, { minItems: 2, maxItems: 8 }) }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.createPod(input)); },
    }),
    tool({
      name: "commander_pod_update",
      description: "Correct a pod name or replace its ordered deck/persona seats. This does not start a game.",
      parameters: Type.Object({ podId: id, name: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })), participants: Type.Optional(Type.Array(participant, { minItems: 2, maxItems: 8 })) }, { additionalProperties: false }),
      execute: async ({ podId, ...input }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.updatePod(podId, input)); },
    }),
    tool({
      name: "commander_pod_delete",
      description: "Delete a pod only when it has no simulation history.",
      parameters: Type.Object({ podId: id }, { additionalProperties: false }),
      execute: async ({ podId }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.deletePod(podId)); },
    }),
    tool({
      name: "commander_pod_status",
      description: "Get one pod or list all durable Commander pods.",
      parameters: Type.Object({ podId: Type.Optional(id) }, { additionalProperties: false }),
      execute: async ({ podId }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => podId ? service.getPod(podId) : service.listPods()); },
    }),
    tool({
      name: "commander_simulate",
      description: "Run 1-10 headless Forge Commander games for a durable pod and store per-game winners, turns, durations, seed, and owner-only logs. Requires explicit confirmation.",
      parameters: Type.Object({ podId: id, games: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 1 })), seed: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_147_483_647 })), timeoutSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 300, default: 120 })), confirmed: Type.Literal(true) }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.simulate(input)); },
    }),
    tool({
      name: "commander_season_create",
      description: "Create a durable seven-day comic season from exactly two real owned built decks as heroes and four generated/not-owned built decks as opponents. The generated tag is enforced so synthetic decks cannot be mistaken for owned decks.",
      parameters: Type.Object({
        confirmed: Type.Literal(true),
        seasonKey: Type.String({ pattern: "^[a-z0-9][a-z0-9_-]{0,99}$" }),
        title: Type.String({ minLength: 1, maxLength: 300 }),
        heroPublicIds: Type.Array(id, { minItems: 2, maxItems: 2 }),
        opponentPublicIds: Type.Array(id, { minItems: 4, maxItems: 4 }),
      }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.createSeason(input)); },
    }),
    tool({
      name: "commander_season_simulate_next",
      description: "Run and store the next factual game in a comic season. Games 1-6 rotate every opponent pair alongside both heroes; game 7 is a finale against the two strongest opponents. Call once per game and read each stored log before planning.",
      parameters: Type.Object({
        seasonId: id,
        confirmed: Type.Literal(true),
        seed: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_147_483_647 })),
        timeoutSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 300, default: 300 })),
      }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.simulateNextSeasonGame(input)); },
    }),
    tool({
      name: "commander_season_plan",
      description: "After all seven games, store one complete seven-episode narrative plan and queue its full-bleed Discord cover. Each day is bound to its corresponding persisted simulation run, uses 3-4 pages, must cite factual gameplay cues, and inherits one season-wide art direction and continuity bible.",
      parameters: Type.Object({ seasonId: id, confirmed: Type.Literal(true), episodes: Type.Array(seasonEpisode, { minItems: 7, maxItems: 7 }) }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.planSeason(input)); },
    }),
    tool({
      name: "commander_season_publish_next",
      description: "Ensure the season cover is delivered, then reconcile rendering status and queue at most one next episode for resumable image generation and Discord delivery. It never reruns games or rewrites the stored season plan.",
      parameters: Type.Object({ seasonId: id, confirmed: Type.Literal(true) }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.publishNextSeasonEpisode(input)); },
    }),
    tool({
      name: "commander_season_status",
      description: "Inspect one comic season or list recent seasons, including cover status, cast provenance, factual game runs, episode progress, and the next required action.",
      parameters: Type.Object({ seasonId: Type.Optional(id) }, { additionalProperties: false }),
      execute: async ({ seasonId }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.seasonStatus(seasonId)); },
    }),
    tool({
      name: "commander_daily_game",
      description: "Select four distinct built decks, shuffle the four Forge personas one per deck, update the reusable Daily Commander Game pod, and run one durably logged game. Requires explicit confirmation.",
      parameters: Type.Object({ confirmed: Type.Literal(true), seed: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_147_483_647 })), timeoutSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 300, default: 180 })) }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.dailyGame(input)); },
    }),
    tool({
      name: "commander_run_log",
      description: "Read a bounded page of meaningful turn, spell, combat, damage, life, zone-change, and outcome events from an owner-only full Forge game log.",
      parameters: Type.Object({ runId: id, offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 300 })) }, { additionalProperties: false }),
      execute: async ({ runId, offset, limit }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.runLog(runId, offset, limit)); },
    }),
    tool({
      name: "commander_standings",
      description: "Summarize completed-game wins, losses, draws, and win rates by deck, persona, and deck-persona pairing.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (_input, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.standings()); },
    }),
    tool({
      name: "commander_comic_publish",
      description: "Queue independent sequential comic rendering and direct Discord delivery for one completed run, returning immediately without agent polling. Read the full meaningful run log first, establish factual chronology, then adapt setup, escalation, reversal, climax, and aftermath. Use each commander—not the deck name—as a stable acting character. Supply at least one concrete factual gameplayCue per page so major casts, attacks, blocks, removal, sacrifice, recursion, or commander damage remain clearly recognizable as diegetic story actions. Give every page a concrete setting and 2-4 specific background elements, with at least two visibly distinct settings across the comic. Never add scores, UI, rules text, or invented mechanics. Requires explicit confirmation.",
      parameters: Type.Object({
        confirmed: Type.Literal(true),
        runId: id,
        summary: Type.String({ minLength: 1, maxLength: 8_000 }),
        continuityGuide: Type.String({ minLength: 200, maxLength: 12_000 }),
        artDirectionSeed: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
        seriesLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
        story: comicStory,
        pages: Type.Optional(Type.Array(comicPage, { minItems: 3, maxItems: 4 })),
      }, { additionalProperties: false }),
      execute: async (input, config, { api, signal }) => withService(api, config, service => service.publishComic(input, signal)),
    }),
    tool({
      name: "commander_comic_status",
      description: "Read durable status for a queued, running, completed, partial, or failed comic publication. Use only when the user explicitly asks; normal publication delivers directly without polling.",
      parameters: Type.Object({ runId: id }, { additionalProperties: false }),
      execute: async ({ runId }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => service.comicStatus(runId)); },
    }),
    tool({
      name: "commander_simulation_status",
      description: "Get one durable simulation run or list recent runs.",
      parameters: Type.Object({ runId: Type.Optional(id), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })) }, { additionalProperties: false }),
      execute: async ({ runId, limit }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => runId ? service.getRun(runId) : service.listRuns(limit)); },
    }),
  ],
});
