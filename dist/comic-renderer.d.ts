import { type ComicPublishInput } from "./comic-types.js";
export type { ComicPublishInput } from "./comic-types.js";
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
    publish(input: ComicPublishInput): Promise<Record<string, unknown>>;
}
export declare function executeCommand(command: string, args: string[], options: {
    timeoutMs: number;
    signal?: AbortSignal;
}): Promise<CommandResult>;
export declare function writeManifest(path: string, value: unknown): void;
