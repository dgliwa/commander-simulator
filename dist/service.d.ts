import { type ComicPublishInput } from "./comic-renderer.js";
import { SimulatorDatabase } from "./database.js";
import { MagicDeckSource } from "./magic-source.js";
import type { SimulatorPaths } from "./paths.js";
import { type ForgePersona } from "./types.js";
export declare class CommanderSimulatorService {
    private readonly database;
    private readonly magic;
    private readonly paths;
    private readonly options;
    constructor(database: SimulatorDatabase, magic: MagicDeckSource, paths: SimulatorPaths, options?: {
        comicDiscordTarget?: string;
        openclawCommand?: string;
    });
    personas(): {
        personas: {
            name: string;
            description: string;
        }[];
        note: string;
    };
    builtDecks(): {
        decks: {
            publicId: string;
            name: string;
            publicUrl: string;
            cardCount: number;
            snapshotRefreshedAt: string | undefined;
        }[];
    };
    createPod(input: {
        name: string;
        participants: Array<{
            publicId: string;
            persona?: ForgePersona;
        }>;
    }): import("./types.js").Pod;
    updatePod(id: string, input: {
        name?: string;
        participants?: Array<{
            publicId: string;
            persona?: ForgePersona;
        }>;
    }): import("./types.js").Pod;
    deletePod(id: string): {
        deleted: string;
    };
    listPods(): {
        pods: import("./types.js").Pod[];
    };
    getPod(id: string): import("./types.js").Pod;
    compatibility(publicId: string): {
        deck: {
            publicId: string;
            name: string;
            publicUrl: string;
            tags: string[];
        };
        commanderCount: number;
        mainboardCount: number;
        total: number;
        transformedNames: {
            source: string;
            forge: string;
        }[];
        warnings: string[];
        compatible: boolean;
    };
    simulate(input: {
        podId: string;
        games?: number;
        seed?: number;
        timeoutSeconds?: number;
        confirmed: boolean;
    }): Promise<import("./types.js").SimulationRun>;
    listRuns(limit?: number): {
        runs: import("./types.js").SimulationRun[];
    };
    getRun(id: string): import("./types.js").SimulationRun;
    runLog(id: string, offset?: number, limit?: number): {
        runId: string;
        totalEvents: number;
        offset: number;
        limit: number;
        hasMore: boolean;
        events: string[];
    };
    standings(): {
        deckPersonas: {
            publicId: string;
            deckName: string;
            persona: string;
            games: number;
            wins: number;
            losses: number;
            draws: number;
            winRate: number;
        }[];
        decks: any[];
        personas: any[];
    };
    dailyGame(input: {
        confirmed: true;
        seed?: number;
        timeoutSeconds?: number;
    }): Promise<import("./types.js").SimulationRun>;
    publishComic(input: ComicPublishInput, signal?: AbortSignal): Promise<{
        runId: string;
        delivered: boolean;
        discordTarget: string;
        rendered: {
            pageNumber: number;
            path: string;
            reused: boolean;
        }[];
        failed: {
            pageNumber: number;
            error: string;
        }[];
        delivery: unknown;
        manifestPath: string;
    }>;
    status(): {
        builtDecks: number;
        forge: {
            java: string;
            jar: string;
            deckDirectory: string;
        };
        limits: {
            players: string;
            gamesPerInvocation: string;
            perGameTimeoutSeconds: string;
        };
        path: string;
        pods: number;
        runs: number;
        games: number;
        lastCompletedAt: string | undefined;
    };
    private assertBuilt;
}
