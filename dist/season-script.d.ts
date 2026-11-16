import { type ComicPanelInput, type ComicPublishInput } from "./comic-types.js";
import type { SeasonScript, SeasonScriptCharacter, SeasonScriptEpisode } from "./types.js";
export interface SeasonScriptDraft {
    premise: string;
    dramaticQuestion: string;
    continuityGuide: string;
    characters: SeasonScriptCharacter[];
    episodes: SeasonScriptEpisode[];
}
export interface SeasonPanelPlan {
    dayNumber: number;
    pages: Array<{
        pageNumber: number;
        panels: ComicPanelInput[];
    }>;
}
export declare function validateSeasonScript(script: SeasonScriptDraft, expectedPublicIds: string[]): SeasonScriptDraft;
export declare function validateScriptedComics(script: SeasonScript, planned: Array<{
    dayNumber: number;
    comic: ComicPublishInput;
}>): void;
export declare function buildScriptedComics(input: {
    seasonTitle: string;
    styleSeed: string;
    script: SeasonScript;
    games: Array<{
        runId: string;
        participantPublicIds: string[];
        participants: Array<{
            publicId: string;
            persona: string;
        }>;
    }>;
    plans: SeasonPanelPlan[];
}): Array<{
    dayNumber: number;
    runId: string;
    comic: ComicPublishInput;
}>;
