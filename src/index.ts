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

async function withService<T>(api: any, config: Record<string, unknown>, operation: (service: CommanderSimulatorService) => T | Promise<T>): Promise<T> {
  const stateDir = api.runtime.state.resolveStateDir(process.env);
  const paths = resolveSimulatorPaths(stateDir, config);
  const database = new SimulatorDatabase(paths.database);
  const magic = new MagicDeckSource(paths.magicDatabase);
  try {
    return await operation(new CommanderSimulatorService(database, magic, paths));
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
      name: "commander_simulation_status",
      description: "Get one durable simulation run or list recent runs.",
      parameters: Type.Object({ runId: Type.Optional(id), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })) }, { additionalProperties: false }),
      execute: async ({ runId, limit }, config, { api, signal }) => { signal?.throwIfAborted(); return withService(api, config, service => runId ? service.getRun(runId) : service.listRuns(limit)); },
    }),
  ],
});
