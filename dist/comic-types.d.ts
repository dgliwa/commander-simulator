export interface ComicDialogue {
    speaker: string;
    text: string;
}
export interface ComicPanelInput {
    visual: string;
    gameplayCue?: string;
    caption?: string;
    dialogue: ComicDialogue[];
}
export interface ComicPageInput {
    pageNumber: number;
    title: string;
    storyBeat: string;
    setting: string;
    backgroundElements: string[];
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
    artDirectionSeed?: string;
    seriesLabel?: string;
    story: ComicStoryPlan;
    pages: ComicPageInput[];
}
type ComicPanelDraft = Omit<ComicPanelInput, "dialogue"> & {
    dialogue?: ComicDialogue[];
};
type ComicPageDraft = Omit<ComicPageInput, "setting" | "backgroundElements" | "panels"> & {
    setting?: string;
    backgroundElements?: string[];
    panels: ComicPanelDraft[];
};
export interface ComicPublishDraft extends Omit<ComicPublishInput, "story" | "pages"> {
    story: ComicStoryPlan & {
        pages?: ComicPageDraft[];
    };
    pages?: ComicPageDraft[];
}
export interface ComicStyleProfile {
    id: string;
    visualLanguage: string;
    surface: string;
    layout: string;
    colorScript: string;
}
export interface ComicBackgroundProfile {
    id: string;
    direction: string;
    composition: string;
}
export declare function normalizeComicInput(input: ComicPublishDraft): ComicPublishInput;
export declare function selectComicStyle(runId: string): ComicStyleProfile;
export declare function selectComicBackground(runId: string): ComicBackgroundProfile;
export declare function validateComicInput(input: ComicPublishInput): void;
export declare function composePagePrompt(input: ComicPublishInput, page: ComicPageInput, style?: ComicStyleProfile, background?: ComicBackgroundProfile): string;
export {};
