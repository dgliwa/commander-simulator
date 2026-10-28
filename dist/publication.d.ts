export declare const EXIT: {
    readonly ok: 0;
    readonly failure: 1;
    readonly usage: 2;
    readonly notFound: 3;
};
export interface ComicProjection {
    projectionVersion: 1;
    source: {
        system: "commander-comic";
        recordId: string;
        version: string;
    };
    occurredAt: string;
    fields: {
        title: string;
        summary: string;
        premise?: string;
        dramaticQuestion?: string;
        seriesLabel?: string;
        pageCount: number;
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
interface CompletedManifest {
    runId: string;
    status: string;
    storyTitle?: string;
    pageCount?: number;
    completedAt?: string;
    rendered?: Array<{
        pageNumber: number;
        path: string;
    }>;
    input?: {
        summary?: string;
        seriesLabel?: string;
        story?: {
            title?: string;
            premise?: string;
            dramaticQuestion?: string;
        };
        pages?: Array<{
            pageNumber: number;
            title?: string;
            storyBeat?: string;
        }>;
    };
}
interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
}
export declare function projectComic(manifest: CompletedManifest, comicRoot: string): ComicProjection;
export declare function runPublicationCli(argv: string[], io: CliIo): number;
export {};
