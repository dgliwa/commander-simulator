export interface SeasonCommanderProjection {
    name: string;
    deckName: string;
    deckPublicId: string;
    role: "hero" | "rival";
    scryfallUrl: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
}
export interface SeasonMatchProjection {
    number: number;
    title: string;
    summary: string;
    winnerNames: string[];
    turns?: number;
    keyMoments: string[];
}
export interface SeasonProjection {
    projectionVersion: 1;
    source: {
        system: "commander-season";
        recordId: string;
        version: string;
    };
    occurredAt: string;
    fields: {
        title: string;
        summary: string;
        premise?: string;
        dramaticQuestion?: string;
        matchCount: number;
        pageCount: number;
        commanders: SeasonCommanderProjection[];
        matches: SeasonMatchProjection[];
    };
    optInFields: Record<string, never>;
    media: Array<{
        id: string;
        path: string;
        mimeType: "image/png";
        caption: string;
        altHint: string;
    }>;
}
export declare const SEASON_EXIT: {
    readonly ok: 0;
    readonly failure: 1;
    readonly usage: 2;
    readonly notFound: 3;
};
export declare function scryfallCardUrl(name: string): string;
export declare function projectSeason(seasonId: string, comicRoot: string, databasePath: string, magicDatabasePath: string): SeasonProjection;
interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
}
export declare function runSeasonPublicationCli(argv: string[], io: CliIo): number;
export {};
