import type { MagicDeckRecord, PodParticipant, SimulationGame } from "./types.js";
import type { SimulatorPaths } from "./paths.js";
export interface ForgeParticipant extends PodParticipant {
    name: string;
    deck: MagicDeckRecord;
}
export interface ForgeResult {
    games: SimulationGame[];
    output: string;
    error?: string;
}
export declare function writeForgeDeck(directory: string, deck: MagicDeckRecord): string;
export declare function runForge(paths: SimulatorPaths, participants: ForgeParticipant[], games: number, seed: number, timeoutSeconds: number, logPath: string): Promise<ForgeResult>;
export declare function parseForgeOutput(output: string, participants: Array<Pick<ForgeParticipant, "publicId">>, requestedGames: number): SimulationGame[];
