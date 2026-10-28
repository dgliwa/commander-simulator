import type { ComicPublishInput } from "./comic-types.js";
import type { ComicSeason, Pod, PodParticipant, SeasonEpisode, SeasonEpisodeStatus, SeasonGame, SeasonStatus, SimulationGame, SimulationRun } from "./types.js";
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
    createSeason(input: {
        seasonKey: string;
        title: string;
        heroPublicIds: string[];
        opponentPublicIds: string[];
        styleSeed?: string;
    }, now?: string): ComicSeason;
    getSeason(id: string): ComicSeason;
    listSeasons(limit?: number): ComicSeason[];
    updateSeasonStatus(id: string, status: SeasonStatus, now?: string): ComicSeason;
    addSeasonGame(input: Omit<SeasonGame, "createdAt">, now?: string): SeasonGame;
    getSeasonGames(seasonId: string): SeasonGame[];
    saveSeasonPlan(seasonId: string, episodes: Array<{
        dayNumber: number;
        runId: string;
        comic: ComicPublishInput;
    }>, now?: string): SeasonEpisode[];
    getSeasonEpisodes(seasonId: string): SeasonEpisode[];
    updateEpisodeStatus(seasonId: string, dayNumber: number, status: SeasonEpisodeStatus, publishedAt?: string): SeasonEpisode;
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
