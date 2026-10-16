export interface ComicPageInput {
    pageNumber: number;
    prompt: string;
}
export interface ComicPublishInput {
    confirmed: true;
    runId: string;
    summary: string;
    pages: ComicPageInput[];
}
export interface CommandResult {
    stdout: string;
    stderr: string;
}
export type CommandRunner = (command: string, args: string[], options: {
    timeoutMs: number;
    signal?: AbortSignal;
}) => Promise<CommandResult>;
export declare class ComicRenderer {
    private readonly comicRoot;
    private readonly discordTarget;
    private readonly openclawCommand;
    private readonly runCommand;
    constructor(comicRoot: string, discordTarget: string, openclawCommand?: string, runCommand?: CommandRunner);
    publish(input: ComicPublishInput, signal?: AbortSignal): Promise<{
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
}
