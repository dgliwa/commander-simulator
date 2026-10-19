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
export interface ComicPublishDraft extends Omit<ComicPublishInput, "story" | "pages"> {
    story: ComicStoryPlan & {
        pages?: Array<Omit<ComicPageInput, "panels"> & {
            panels: Array<Omit<ComicPanelInput, "dialogue"> & {
                dialogue?: ComicDialogue[];
            }>;
        }>;
    };
    pages?: Array<Omit<ComicPageInput, "panels"> & {
        panels: Array<Omit<ComicPanelInput, "dialogue"> & {
            dialogue?: ComicDialogue[];
        }>;
    }>;
}
export interface ComicStyleProfile {
    id: string;
    visualLanguage: string;
    layout: string;
    colorScript: string;
}
export declare function normalizeComicInput(input: ComicPublishDraft): ComicPublishInput;
export declare function selectComicStyle(runId: string): ComicStyleProfile;
export declare function validateComicInput(input: ComicPublishInput): void;
export declare function composePagePrompt(input: ComicPublishInput, page: ComicPageInput, style?: ComicStyleProfile): string;
