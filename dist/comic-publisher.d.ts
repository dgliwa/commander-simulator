import { type ComicPublishDraft, type ComicPublishInput } from "./comic-types.js";
export interface WorkerRequest {
    comicRoot: string;
    discordTarget: string;
    openclawCommand: string;
    input: ComicPublishInput;
}
export type ComicWorkerLauncher = (requestPath: string, logPath: string) => number;
export declare class ComicPublisher {
    private readonly comicRoot;
    private readonly discordTarget;
    private readonly openclawCommand;
    private readonly launchWorker;
    constructor(comicRoot: string, discordTarget: string, openclawCommand?: string, launchWorker?: ComicWorkerLauncher);
    enqueue(draft: ComicPublishDraft, signal?: AbortSignal): Record<string, unknown>;
    status(runId: string): Record<string, unknown>;
}
export declare function readWorkerRequest(path: string): WorkerRequest;
