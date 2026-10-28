import { type CommandRunner } from "./comic-renderer.js";
import { type SeasonCoverInput } from "./season-cover-types.js";
export declare class SeasonCoverRenderer {
    private readonly comicRoot;
    private readonly discordTarget;
    private readonly openclawCommand;
    private readonly runCommand;
    constructor(comicRoot: string, discordTarget: string, openclawCommand?: string, runCommand?: CommandRunner);
    publish(input: SeasonCoverInput): Promise<Record<string, unknown>>;
    reportFailure(input: SeasonCoverInput, error: unknown): Promise<Record<string, unknown>>;
}
