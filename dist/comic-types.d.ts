export interface ComicDialogue {
    speaker: string;
    text: string;
}
export interface ComicPanelInput {
    visual: string;
    caption?: string;
    dialogue: ComicDialogue[];
}
export interface ComicPageInput {
    pageNumber: number;
    title: string;
    storyBeat: string;
    panels: ComicPanelInput[];
}
export interface ComicPersonaDirection {
    deckName: string;
    commanderName: string;
    persona: "Default" | "Cautious" | "Reckless" | "Experimental";
    role: string;
    voice: string;
}
export interface ComicStoryPlan {
    title: string;
    premise: string;
    dramaticQuestion: string;
    personaDirections: ComicPersonaDirection[];
}
export interface ComicPublishInput {
    confirmed: true;
    runId: string;
    summary: string;
    continuityGuide: string;
    story: ComicStoryPlan;
    pages: ComicPageInput[];
}
export declare function validateComicInput(input: ComicPublishInput): void;
export declare function composePagePrompt(input: ComicPublishInput, page: ComicPageInput): string;
