import { validateDialogueQuality } from "./comic-types.js";
export function validateSeasonScript(script, expectedPublicIds) {
    text(script.premise, 20, 2_000, "premise");
    text(script.dramaticQuestion, 10, 1_000, "dramaticQuestion");
    text(script.continuityGuide, 200, 12_000, "continuityGuide");
    const expected = new Set(expectedPublicIds);
    if (script.characters.length !== expected.size)
        throw new Error(`Season script requires exactly ${expected.size} characters.`);
    const characterIds = new Set();
    const speakers = new Set();
    for (const character of script.characters) {
        if (!expected.has(character.publicId))
            throw new Error(`Unexpected season-script character: ${character.publicId}.`);
        if (characterIds.has(character.publicId))
            throw new Error(`Duplicate season-script character: ${character.publicId}.`);
        characterIds.add(character.publicId);
        text(character.deckName, 1, 300, `${character.publicId} deckName`);
        text(character.commanderName, 1, 300, `${character.publicId} commanderName`);
        text(character.role, 3, 500, `${character.commanderName} role`);
        text(character.voice, 20, 500, `${character.commanderName} voice`);
        speakers.add(character.commanderName.trim().toLocaleLowerCase());
    }
    if ([...expected].some(publicId => !characterIds.has(publicId)))
        throw new Error("Season script must define every cast member exactly once.");
    const episodes = [...script.episodes].sort((left, right) => left.dayNumber - right.dayNumber);
    if (episodes.length !== 7)
        throw new Error("Season script requires exactly seven episodes.");
    episodes.forEach((episode, index) => validateEpisode(episode, index + 1, speakers));
    validateDialogueQuality([dialogueValidationInput(script)]);
    return { ...script, episodes };
}
export function validateScriptedComics(script, planned) {
    if (planned.length !== 7)
        throw new Error("A season comic plan requires exactly seven scripted episodes.");
    for (const [index, episode] of script.episodes.entries()) {
        const item = planned[index];
        if (!item || item.dayNumber !== episode.dayNumber)
            throw new Error("Comic plan day numbers must follow the stored script from 1 through 7.");
        const comic = item.comic;
        if (comic.summary !== episode.summary || comic.continuityGuide !== script.continuityGuide
            || comic.story.title !== episode.title || comic.story.premise !== script.premise
            || comic.story.dramaticQuestion !== script.dramaticQuestion) {
            throw new Error(`Day ${episode.dayNumber} comic framing must match the stored season script exactly.`);
        }
        if (comic.pages.length !== 1)
            throw new Error(`Day ${episode.dayNumber} must contain exactly one page.`);
        const page = comic.pages[0];
        if (!page || page.pageNumber !== 1 || page.title !== episode.title) {
            throw new Error(`Day ${episode.dayNumber} must use one page with the stored episode title.`);
        }
        assertPageFollowsEpisode(episode, page.panels);
    }
}
export function buildScriptedComics(input) {
    const plans = [...input.plans].sort((left, right) => left.dayNumber - right.dayNumber);
    if (plans.length !== 7)
        throw new Error("A season comic plan requires exactly seven scripted episodes.");
    return input.script.episodes.map((episode, index) => {
        const plan = plans[index];
        if (!plan || plan.dayNumber !== episode.dayNumber)
            throw new Error("Comic plan day numbers must cover 1 through 7.");
        const game = input.games[index];
        if (!game)
            throw new Error(`Missing game for day ${episode.dayNumber}.`);
        const pagePlans = [...plan.pages].sort((left, right) => left.pageNumber - right.pageNumber);
        if (pagePlans.length !== 1 || pagePlans[0]?.pageNumber !== 1) {
            throw new Error(`Day ${episode.dayNumber} must contain exactly one page numbered 1.`);
        }
        const page = pagePlans[0];
        assertPageFollowsEpisode(episode, page.panels);
        const pages = [{
                pageNumber: 1,
                title: episode.title,
                storyBeat: episode.scenes.map(scene => scene.storyBeat).join(" "),
                setting: episode.scenes.map(scene => scene.setting).join("; "),
                backgroundElements: [...new Set(episode.scenes.flatMap(scene => scene.backgroundElements))].slice(0, 4),
                panels: page.panels,
            }];
        const participantSet = new Set(game.participantPublicIds);
        const personaById = new Map(game.participants.map(participant => [participant.publicId, participant.persona]));
        const personaDirections = input.script.characters
            .filter(character => participantSet.has(character.publicId))
            .map(character => ({
            deckName: character.deckName,
            commanderName: character.commanderName,
            persona: personaById.get(character.publicId),
            role: character.role,
            voice: character.voice,
        }));
        if (personaDirections.length !== 4 || personaDirections.some(direction => !direction.persona)) {
            throw new Error(`Day ${episode.dayNumber} script characters do not match its four simulation participants.`);
        }
        return {
            dayNumber: episode.dayNumber,
            runId: game.runId,
            comic: {
                confirmed: true,
                runId: game.runId,
                summary: episode.summary,
                continuityGuide: input.script.continuityGuide,
                artDirectionSeed: input.styleSeed,
                seriesLabel: `${input.seasonTitle} · Day ${episode.dayNumber} of 7`,
                story: {
                    title: episode.title,
                    premise: input.script.premise,
                    dramaticQuestion: input.script.dramaticQuestion,
                    personaDirections,
                },
                pages,
            },
        };
    });
}
function validateEpisode(episode, expectedDay, speakers) {
    if (episode.dayNumber !== expectedDay)
        throw new Error("Season script day numbers must cover 1 through 7.");
    text(episode.title, 1, 300, `day ${expectedDay} title`);
    text(episode.summary, 20, 8_000, `day ${expectedDay} summary`);
    if (episode.scenes.length !== 3)
        throw new Error(`Day ${expectedDay} requires exactly three scripted scenes.`);
    let dialogueCount = 0;
    episode.scenes.forEach((scene, index) => {
        if (scene.sceneNumber !== index + 1)
            throw new Error(`Day ${expectedDay} scene numbers must cover 1 through 3.`);
        text(scene.title, 1, 200, `day ${expectedDay} scene ${scene.sceneNumber} title`);
        text(scene.setting, 20, 1_000, `day ${expectedDay} scene ${scene.sceneNumber} setting`);
        text(scene.storyBeat, 20, 2_000, `day ${expectedDay} scene ${scene.sceneNumber} storyBeat`);
        if (scene.backgroundElements.length < 2 || scene.backgroundElements.length > 4)
            throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} requires 2-4 background elements.`);
        scene.backgroundElements.forEach((value, item) => text(value, 3, 300, `day ${expectedDay} scene ${scene.sceneNumber} background ${item + 1}`));
        if (scene.gameplayCues.length < 1 || scene.gameplayCues.length > 4)
            throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} requires 1-4 factual gameplay cues.`);
        scene.gameplayCues.forEach((value, item) => text(value, 10, 500, `day ${expectedDay} scene ${scene.sceneNumber} gameplay cue ${item + 1}`));
        if (scene.dialogue.length > 4)
            throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} may contain at most four dialogue lines.`);
        for (const line of scene.dialogue) {
            text(line.speaker, 1, 100, "dialogue speaker");
            text(line.text, 1, 120, "dialogue text");
            if (!speakers.has(line.speaker.trim().toLocaleLowerCase()))
                throw new Error(`Unknown scripted speaker: ${line.speaker}.`);
            dialogueCount += 1;
        }
    });
    if (dialogueCount < 3)
        throw new Error(`Day ${expectedDay} requires at least three purposeful dialogue lines across its script.`);
    const gameplayCueCount = episode.scenes.reduce((total, scene) => total + scene.gameplayCues.length, 0);
    if (gameplayCueCount > 6)
        throw new Error(`Day ${expectedDay} may contain at most six gameplay cues across its one-page episode.`);
}
function assertPageFollowsEpisode(episode, panels) {
    if (panels.length < 4 || panels.length > 6)
        throw new Error(`Day ${episode.dayNumber} requires 4-6 panels on its single page.`);
    const plannedDialogue = panels.flatMap(panel => panel.dialogue.map(line => `${line.speaker}\u0000${line.text}`));
    const scriptedDialogue = episode.scenes.flatMap(scene => scene.dialogue.map(line => `${line.speaker}\u0000${line.text}`));
    if (JSON.stringify(plannedDialogue) !== JSON.stringify(scriptedDialogue)) {
        throw new Error(`Day ${episode.dayNumber} panels must use all scripted dialogue exactly, in order, without additions.`);
    }
    const cues = new Set(panels.flatMap(panel => panel.gameplayCue ? [panel.gameplayCue] : []));
    const missing = episode.scenes.flatMap(scene => scene.gameplayCues).filter(cue => !cues.has(cue));
    if (missing.length)
        throw new Error(`Day ${episode.dayNumber} is missing scripted gameplay cues: ${missing.join(" | ")}`);
}
function dialogueValidationInput(script) {
    return {
        confirmed: true,
        runId: "00000000-0000-4000-8000-000000000000",
        summary: "Season script dialogue validation.",
        continuityGuide: script.continuityGuide,
        story: { title: "Season script", premise: script.premise, dramaticQuestion: script.dramaticQuestion, personaDirections: [] },
        pages: script.episodes.flatMap(episode => episode.scenes.map(scene => ({
            pageNumber: scene.sceneNumber,
            title: scene.title,
            storyBeat: scene.storyBeat,
            setting: scene.setting,
            backgroundElements: scene.backgroundElements,
            panels: [{ visual: "A validation-only panel preserves the scripted scene dialogue before comic breakdown.", dialogue: scene.dialogue }],
        }))),
    };
}
function text(value, min, max, label) {
    const length = value.trim().length;
    if (length < min || length > max)
        throw new Error(`${label} must contain ${min}-${max} characters.`);
}
