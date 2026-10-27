import { type ComicPublishDraft } from "./comic-types.js";
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
            tags: string[];
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
        participants: {
            deckName: string;
            commanderNames: string[];
            persona: "Default" | "Cautious" | "Reckless" | "Experimental";
            seat: number;
        }[];
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
    createSeason(input: {
        confirmed: true;
        seasonKey: string;
        title: string;
        heroPublicIds: string[];
        opponentPublicIds: string[];
    }): {
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
    };
    simulateNextSeasonGame(input: {
        seasonId: string;
        confirmed: true;
        seed?: number;
        timeoutSeconds?: number;
    }): Promise<{
        stored: boolean;
        seasonId: string;
        gameNumber: number;
        label: string;
        run: import("./types.js").SimulationRun;
        retry: string;
    } | {
        latestRun: import("./types.js").SimulationRun;
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
        stored: boolean;
        seasonId?: undefined;
        gameNumber?: undefined;
        label?: undefined;
        run?: undefined;
        retry?: undefined;
    }>;
    planSeason(input: {
        seasonId: string;
        confirmed: true;
        episodes: Array<{
            dayNumber: number;
            summary: string;
            continuityGuide: string;
            story: ComicPublishDraft["story"];
            pages: NonNullable<ComicPublishDraft["pages"]>;
        }>;
    }): {
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
    };
    publishNextSeasonEpisode(input: {
        seasonId: string;
        confirmed: true;
    }): {
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
        queued: boolean;
        reason: string;
    } | {
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
        queued: boolean;
        dayNumber: number;
        publication: Record<string, unknown>;
    };
    seasonStatus(seasonId?: string): {
        season: import("./types.js").ComicSeason;
        cast: {
            heroes: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
            opponents: {
                publicId: string;
                name: string;
                commanders: string[];
                tags: string[];
            }[];
        };
        games: {
            run: import("./types.js").SimulationRun;
            seasonId: string;
            gameNumber: number;
            label: string;
            podId: string;
            runId: string;
            participantPublicIds: string[];
            createdAt: string;
        }[];
        episodes: {
            seasonId: string;
            dayNumber: number;
            runId: string;
            status: import("./types.js").SeasonEpisodeStatus;
            publishedAt?: string;
        }[];
        nextAction: string;
    } | {
        seasons: {
            season: import("./types.js").ComicSeason;
            cast: {
                heroes: {
                    publicId: string;
                    name: string;
                    commanders: string[];
                    tags: string[];
                }[];
                opponents: {
                    publicId: string;
                    name: string;
                    commanders: string[];
                    tags: string[];
                }[];
            };
            games: {
                run: import("./types.js").SimulationRun;
                seasonId: string;
                gameNumber: number;
                label: string;
                podId: string;
                runId: string;
                participantPublicIds: string[];
                createdAt: string;
            }[];
            episodes: {
                seasonId: string;
                dayNumber: number;
                runId: string;
                status: import("./types.js").SeasonEpisodeStatus;
                publishedAt?: string;
            }[];
            nextAction: string;
        }[];
    };
    dailyGame(input: {
        confirmed: true;
        seed?: number;
        timeoutSeconds?: number;
    }): Promise<import("./types.js").SimulationRun>;
    publishComic(input: ComicPublishDraft, signal?: AbortSignal): Record<string, unknown>;
    comicStatus(runId: string): Record<string, unknown>;
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
    private seasonDetails;
    private finaleOpponents;
    private assertBuilt;
}
