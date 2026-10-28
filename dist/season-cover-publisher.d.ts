import { type SeasonCoverInput } from "./season-cover-types.js";
export interface SeasonCoverWorkerRequest {
    comicRoot: string;
    discordTarget: string;
    openclawCommand: string;
    input: SeasonCoverInput;
}
export type SeasonCoverWorkerLauncher = (requestPath: string, logPath: string) => number;
export declare class SeasonCoverPublisher {
    private readonly comicRoot;
    private readonly discordTarget;
    private readonly openclawCommand;
    private readonly launchWorker;
    constructor(comicRoot: string, discordTarget: string, openclawCommand?: string, launchWorker?: SeasonCoverWorkerLauncher);
    enqueue(input: SeasonCoverInput, signal?: AbortSignal): Record<string, unknown>;
    status(seasonId: string): Record<string, unknown>;
}
export declare function readSeasonCoverWorkerRequest(path: string): SeasonCoverWorkerRequest;
