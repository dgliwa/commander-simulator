import type { SeasonLifecycleContext } from "./season-lifecycle-types.js";
import type { ComicSeason } from "./types.js";
export interface SeasonReconciliation {
    seasonId: string;
    status: ComicSeason["status"];
    publishedEpisodes: number;
    activeEpisodes: number;
    exportPath?: string;
}
export declare function reconcileSeason(databasePath: string, magicDatabasePath: string, comicRoot: string, seasonId: string): SeasonReconciliation;
export declare function reconcileAllSeasons(databasePath: string, magicDatabasePath: string, comicRoot: string): SeasonReconciliation[];
export declare function oldestUnfinishedSeason(databasePath: string): ComicSeason | undefined;
export declare function queueEpisodeOneAfterCover(context: SeasonLifecycleContext, comicRoot: string, discordTarget: string, openclawCommand: string): Record<string, unknown>;
export declare function reconcileDeliveredEpisode(context: SeasonLifecycleContext, comicRoot: string): SeasonReconciliation;
