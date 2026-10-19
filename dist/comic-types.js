const STYLE_PROFILES = [
    {
        id: "mythic-watercolor",
        visualLanguage: "Luminous watercolor washes over crisp expressive ink, atmospheric edges, and monumental mythic scale.",
        layout: "Alternate broad cinematic panels with intimate borderless reaction insets; let one image break a gutter at the climax.",
        colorScript: "Move from cool dawn hues through saturated conflict colors to a warm, quiet aftermath.",
    },
    {
        id: "noir-neon",
        visualLanguage: "High-contrast fantasy noir with angular shadows, restrained neon magic, rain-like texture, and dramatic rim light.",
        layout: "Use tall suspense panels, sharp diagonal transitions, and one wide reveal panel without sacrificing reading order.",
        colorScript: "Keep environments desaturated while each commander retains a distinct jewel-tone accent.",
    },
    {
        id: "pulp-adventure",
        visualLanguage: "Original painted pulp-fantasy energy, bold silhouettes, tactile brushwork, sweeping motion, and expressive theatrical faces.",
        layout: "Favor energetic diagonals, overlapping foreground elements, and a large centerpiece panel balanced by small reaction beats.",
        colorScript: "Use sun-baked golds and reds during escalation, then a stark complementary color for the reversal.",
    },
    {
        id: "stained-glass-epic",
        visualLanguage: "Jewel-toned high fantasy inspired by stained glass geometry, luminous magic, elegant linework, and sculptural figures.",
        layout: "Frame key turns with geometric panel borders while keeping dialogue panels open and highly legible.",
        colorScript: "Assign each commander a stable glass-like palette and merge those colors only where their forces collide.",
    },
    {
        id: "storybook-gouache",
        visualLanguage: "Rich gouache storybook painting with visible paper grain, stylized shapes, warm character acting, and sweeping fantasy vistas.",
        layout: "Use varied rectangular panels, occasional circular detail insets, and a calm full-width aftermath panel.",
        colorScript: "Begin earthy and inviting, deepen into stormy middle values, then finish with a surprising clear accent.",
    },
    {
        id: "cosmic-opera",
        visualLanguage: "Grand cosmic fantasy with clean graphic inks, radiant energy fields, impossible scale, and elegant space-opera staging.",
        layout: "Mix extreme close-ups with vast establishing panels and reserve the largest panel for the decisive confrontation.",
        colorScript: "Build from deep indigo and violet into prismatic magic while preserving commander-specific palettes.",
    },
    {
        id: "kinetic-linework",
        visualLanguage: "Kinetic black-and-color sequential art with speed-line rhythm, expressive anatomy, ink splashes, and selective painted highlights.",
        layout: "Use clear action-to-action cuts, narrow acceleration panels, and a silent impact panel at the reversal or climax.",
        colorScript: "Keep most surfaces restrained so concentrated color bursts mark consequential actions.",
    },
    {
        id: "bronze-age-fantasy",
        visualLanguage: "Original bronze-age fantasy-comic spirit with confident contour lines, subtle print texture, bold acting, and modern cinematic color.",
        layout: "Use classic grids as a baseline, then disrupt the grid once per page for the strongest story beat.",
        colorScript: "Employ strong flat palette families with atmospheric gradients reserved for major magical moments.",
    },
];
export function normalizeComicInput(input) {
    const nestedPages = input.story?.pages;
    const sourcePages = input.pages ?? nestedPages;
    const story = { ...input.story };
    delete story.pages;
    return {
        ...input,
        story,
        pages: (sourcePages ?? []).map((page) => ({
            ...page,
            panels: page.panels.map((panel) => ({ ...panel, dialogue: panel.dialogue ?? [] })),
        })),
    };
}
export function selectComicStyle(runId) {
    let hash = 2166136261;
    for (const character of runId) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return STYLE_PROFILES[(hash >>> 0) % STYLE_PROFILES.length];
}
export function validateComicInput(input) {
    if (input.confirmed !== true)
        throw new Error("Comic rendering and Discord delivery require confirmed=true.");
    if (!/^[0-9a-f-]{36}$/i.test(input.runId))
        throw new Error("runId must be a simulator UUID.");
    safeText(input.summary, 1, 8_000, "summary");
    safeText(input.continuityGuide, 200, 12_000, "continuityGuide");
    safeText(input.story.title, 1, 300, "story.title");
    safeText(input.story.premise, 20, 2_000, "story.premise");
    safeText(input.story.dramaticQuestion, 10, 1_000, "story.dramaticQuestion");
    if (input.story.personaDirections.length < 2 || input.story.personaDirections.length > 8) {
        throw new Error("story.personaDirections must contain 2-8 participants.");
    }
    const deckNames = new Set();
    const commanderNames = new Set();
    for (const direction of input.story.personaDirections) {
        safeText(direction.deckName, 1, 300, "persona deckName");
        safeText(direction.commanderName, 1, 300, "persona commanderName");
        safeText(direction.role, 3, 500, `${direction.commanderName} role`);
        safeText(direction.voice, 3, 500, `${direction.commanderName} voice`);
        const deckKey = direction.deckName.trim().toLocaleLowerCase();
        if (deckNames.has(deckKey))
            throw new Error(`Duplicate deck direction: ${direction.deckName}.`);
        deckNames.add(deckKey);
        const commanderKey = direction.commanderName.trim().toLocaleLowerCase();
        if (commanderNames.has(commanderKey))
            throw new Error(`Duplicate commander direction: ${direction.commanderName}.`);
        commanderNames.add(commanderKey);
    }
    if (input.pages.length < 3 || input.pages.length > 4)
        throw new Error("Comic must contain 3-4 pages.");
    const pageNumbers = new Set();
    let dialogueCount = 0;
    for (const page of input.pages) {
        if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 4) {
            throw new Error("pageNumber must be an integer from 1 to 4.");
        }
        if (pageNumbers.has(page.pageNumber))
            throw new Error(`Duplicate page number ${page.pageNumber}.`);
        pageNumbers.add(page.pageNumber);
        safeText(page.title, 1, 200, `page ${page.pageNumber} title`);
        safeText(page.storyBeat, 20, 2_000, `page ${page.pageNumber} storyBeat`);
        if (page.panels.length < 4 || page.panels.length > 6)
            throw new Error(`Page ${page.pageNumber} must contain 4-6 panels.`);
        for (const [index, panel] of page.panels.entries()) {
            safeText(panel.visual, 20, 3_000, `page ${page.pageNumber} panel ${index + 1} visual`);
            if (panel.caption !== undefined)
                safeText(panel.caption, 1, 300, `page ${page.pageNumber} panel ${index + 1} caption`);
            if (panel.dialogue.length > 2)
                throw new Error(`Page ${page.pageNumber} panel ${index + 1} may contain at most two dialogue lines.`);
            for (const dialogue of panel.dialogue) {
                safeText(dialogue.speaker, 1, 100, `page ${page.pageNumber} panel ${index + 1} speaker`);
                safeText(dialogue.text, 1, 120, `page ${page.pageNumber} panel ${index + 1} dialogue`);
                dialogueCount += 1;
            }
        }
    }
    if (dialogueCount < input.pages.length)
        throw new Error("The comic must average at least one dialogue line per page.");
    rejectDeckNamesAsCharacters(input);
}
export function composePagePrompt(input, page, style = selectComicStyle(input.runId)) {
    const personaDirections = input.story.personaDirections
        .map((direction) => `- ${direction.commanderName} / ${direction.persona}: ${direction.role}. Voice: ${direction.voice}`)
        .join("\n");
    const panels = page.panels.map((panel, index) => {
        const caption = panel.caption ? ` Caption exactly: “${panel.caption}”` : "";
        const dialogue = panel.dialogue.length
            ? ` Dialogue exactly: ${panel.dialogue.map((line) => `${line.speaker}: “${line.text}”`).join(" | ")}`
            : " No dialogue in panel.";
        return `${index + 1}. ${panel.visual}${caption}${dialogue}`;
    }).join("\n");
    return [
        "Create an ORIGINAL high-end fantasy comic page in portrait 2:3 layout.",
        `DAILY ART DIRECTION — ${style.id}: ${style.visualLanguage}`,
        `LAYOUT RHYTHM: ${style.layout}`,
        `COLOR SCRIPT: ${style.colorScript}`,
        "Maintain confident storytelling, expressive faces, readable silhouettes, clean gutters, and natural reading order.",
        "Do not reproduce Magic card frames, logos, existing card illustrations, named living artists, or existing comic art.",
        "The commanders are acting characters. Never portray or name a deck title as if it were a person.",
        "Use only understated, story-natural card-game nods when supported by the panel: tapping or untapping through pose and motion, gathering or spending mana, casting, or summoning. Never show game UI, life totals, cards, rules text, speech-balloon speaker labels, or floating ability names.",
        `STORY: ${input.story.title}`,
        `PREMISE: ${input.story.premise}`,
        `DRAMATIC QUESTION: ${input.story.dramaticQuestion}`,
        `COMMANDER PERSONAS:\n${personaDirections}`,
        `CONTINUITY GUIDE — follow exactly on every page:\n${input.continuityGuide}`,
        `PAGE ${page.pageNumber}: ${page.title}`,
        `STORY BEAT: ${page.storyBeat}`,
        `Render exactly ${page.panels.length} clearly separated panels:\n${panels}`,
        "All visible text must be only the exact supplied captions and dialogue. Keep lettering short and legible. Do not add card-game names, labels, sound effects, title text, page numbers, signatures, or watermarks.",
    ].join("\n\n");
}
function rejectDeckNamesAsCharacters(input) {
    const narrativeText = [
        input.continuityGuide,
        input.story.premise,
        input.story.dramaticQuestion,
        ...input.pages.flatMap((page) => [
            page.title,
            page.storyBeat,
            ...page.panels.flatMap((panel) => [
                panel.visual,
                panel.caption ?? "",
                ...panel.dialogue.flatMap((dialogue) => [dialogue.speaker, dialogue.text]),
            ]),
        ]),
    ].join("\n").toLocaleLowerCase();
    for (const direction of input.story.personaDirections) {
        const deckName = direction.deckName.trim().toLocaleLowerCase();
        const commanderName = direction.commanderName.trim().toLocaleLowerCase();
        if (deckName === commanderName)
            continue;
        const withoutCommanderReferences = narrativeText.replaceAll(commanderName, "");
        if (withoutCommanderReferences.includes(deckName)) {
            throw new Error(`Comic narrative must use commander ${direction.commanderName}, not deck name ${direction.deckName}, as an acting character.`);
        }
    }
}
function safeText(value, minimum, maximum, label) {
    const text = value?.trim();
    if (!text || text.length < minimum || text.length > maximum || text.includes("\0")) {
        throw new Error(`${label} must contain ${minimum}-${maximum} safe characters.`);
    }
}
