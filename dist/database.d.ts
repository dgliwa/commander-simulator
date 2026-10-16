import type { Pod, PodParticipant, SimulationGame, SimulationRun } from "./types.js";
export declare class SimulatorDatabase {
    private readonly path;
    private readonly db;
    constructor(path: string);
    close(): void;
    createPod(name: string, participants: PodParticipant[], now?: string): Pod;
    updatePod(id: string, input: {
        name?: string;
        participants?: PodParticipant[];
    }, now?: string): Pod;
    deletePod(id: string): {
        deleted: string;
    };
    listPods(): Pod[];
    getPod(id: string): Pod;
    startRun(input: Omit<SimulationRun, "status" | "games" | "winnerCounts" | "draws" | "createdAt">, now?: string): SimulationRun;
    finishRun(id: string, games: SimulationGame[], error?: string, now?: string): SimulationRun;
    listRuns(limit?: number): SimulationRun[];
    getRun(id: string): SimulationRun;
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
    };
    summary(): {
        path: string;
        pods: number;
        runs: number;
        games: number;
        lastCompletedAt: string | undefined;
    };
    private replaceParticipants;
}
