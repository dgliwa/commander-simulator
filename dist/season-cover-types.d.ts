export interface SeasonCoverCharacter {
    commanderName: string;
    role: "hero" | "rival";
}
export interface SeasonCoverInput {
    confirmed: true;
    seasonId: string;
    seasonTitle: string;
    premise: string;
    dramaticQuestion: string;
    continuityGuide: string;
    artDirectionSeed: string;
    characters: SeasonCoverCharacter[];
}
export declare function validateSeasonCoverInput(input: SeasonCoverInput): void;
export declare function composeSeasonCoverPrompt(input: SeasonCoverInput): string;
