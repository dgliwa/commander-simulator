import { validateDialogueQuality, type ComicPanelInput, type ComicPublishInput } from "./comic-types.js";
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

export function validateSeasonScript(script: SeasonScriptDraft, expectedPublicIds: string[]): SeasonScriptDraft {
  text(script.premise, 20, 2_000, "premise");
  text(script.dramaticQuestion, 10, 1_000, "dramaticQuestion");
  text(script.continuityGuide, 200, 12_000, "continuityGuide");

  const expected = new Set(expectedPublicIds);
  if (script.characters.length !== expected.size) throw new Error(`Season script requires exactly ${expected.size} characters.`);
  const characterIds = new Set<string>();
  const speakers = new Set<string>();
  for (const character of script.characters) {
    if (!expected.has(character.publicId)) throw new Error(`Unexpected season-script character: ${character.publicId}.`);
    if (characterIds.has(character.publicId)) throw new Error(`Duplicate season-script character: ${character.publicId}.`);
    characterIds.add(character.publicId);
    text(character.deckName, 1, 300, `${character.publicId} deckName`);
    text(character.commanderName, 1, 300, `${character.publicId} commanderName`);
    text(character.role, 3, 500, `${character.commanderName} role`);
    text(character.voice, 20, 500, `${character.commanderName} voice`);
    speakers.add(character.commanderName.trim().toLocaleLowerCase());
  }
  if ([...expected].some(publicId => !characterIds.has(publicId))) throw new Error("Season script must define every cast member exactly once.");

  const episodes = [...script.episodes].sort((left, right) => left.dayNumber - right.dayNumber);
  if (episodes.length !== 7) throw new Error("Season script requires exactly seven episodes.");
  episodes.forEach((episode, index) => validateEpisode(episode, index + 1, speakers));
  validateDialogueQuality([dialogueValidationInput(script)]);
  return { ...script, episodes };
}

export function validateScriptedComics(script: SeasonScript, planned: Array<{ dayNumber: number; comic: ComicPublishInput }>): void {
  if (planned.length !== 7) throw new Error("A season comic plan requires exactly seven scripted episodes.");
  for (const [index, episode] of script.episodes.entries()) {
    const item = planned[index];
    if (!item || item.dayNumber !== episode.dayNumber) throw new Error("Comic plan day numbers must follow the stored script from 1 through 7.");
    const comic = item.comic;
    if (comic.summary !== episode.summary || comic.continuityGuide !== script.continuityGuide
      || comic.story.title !== episode.title || comic.story.premise !== script.premise
      || comic.story.dramaticQuestion !== script.dramaticQuestion) {
      throw new Error(`Day ${episode.dayNumber} comic framing must match the stored season script exactly.`);
    }
    if (comic.pages.length !== 3) throw new Error(`Day ${episode.dayNumber} must contain exactly three pages, one per scripted scene.`);
    episode.scenes.forEach((scene, sceneIndex) => {
      const page = comic.pages[sceneIndex];
      if (!page || page.pageNumber !== scene.sceneNumber || page.title !== scene.title
        || page.setting !== scene.setting || page.storyBeat !== scene.storyBeat
        || JSON.stringify(page.backgroundElements) !== JSON.stringify(scene.backgroundElements)) {
        throw new Error(`Day ${episode.dayNumber} page ${scene.sceneNumber} must inherit its stored scene framing exactly.`);
      }
      assertPageFollowsScene(episode.dayNumber, scene, page.panels);
    });
  }
}

export function buildScriptedComics(input: {
  seasonTitle: string;
  styleSeed: string;
  script: SeasonScript;
  games: Array<{ runId: string; participantPublicIds: string[]; participants: Array<{ publicId: string; persona: string }> }>;
  plans: SeasonPanelPlan[];
}): Array<{ dayNumber: number; runId: string; comic: ComicPublishInput }> {
  const plans = [...input.plans].sort((left, right) => left.dayNumber - right.dayNumber);
  if (plans.length !== 7) throw new Error("A season comic plan requires exactly seven scripted episodes.");
  return input.script.episodes.map((episode, index) => {
    const plan = plans[index];
    if (!plan || plan.dayNumber !== episode.dayNumber) throw new Error("Comic plan day numbers must cover 1 through 7.");
    const game = input.games[index];
    if (!game) throw new Error(`Missing game for day ${episode.dayNumber}.`);
    const pagePlans = [...plan.pages].sort((left, right) => left.pageNumber - right.pageNumber);
    if (pagePlans.length !== 3) throw new Error(`Day ${episode.dayNumber} must contain exactly three pages, one per scripted scene.`);
    const pages = episode.scenes.map((scene, sceneIndex) => {
      const page = pagePlans[sceneIndex];
      if (!page || page.pageNumber !== scene.sceneNumber) throw new Error(`Day ${episode.dayNumber} page numbers must cover scripted scenes 1 through 3.`);
      assertPageFollowsScene(episode.dayNumber, scene, page.panels);
      return {
        pageNumber: scene.sceneNumber,
        title: scene.title,
        storyBeat: scene.storyBeat,
        setting: scene.setting,
        backgroundElements: scene.backgroundElements,
        panels: page.panels,
      };
    });
    const participantSet = new Set(game.participantPublicIds);
    const personaById = new Map(game.participants.map(participant => [participant.publicId, participant.persona]));
    const personaDirections = input.script.characters
      .filter(character => participantSet.has(character.publicId))
      .map(character => ({
        deckName: character.deckName,
        commanderName: character.commanderName,
        persona: personaById.get(character.publicId) as "Default" | "Cautious" | "Reckless" | "Experimental",
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

function validateEpisode(episode: SeasonScriptEpisode, expectedDay: number, speakers: Set<string>): void {
  if (episode.dayNumber !== expectedDay) throw new Error("Season script day numbers must cover 1 through 7.");
  text(episode.title, 1, 300, `day ${expectedDay} title`);
  text(episode.summary, 20, 8_000, `day ${expectedDay} summary`);
  if (episode.scenes.length !== 3) throw new Error(`Day ${expectedDay} requires exactly three scripted scenes.`);
  let dialogueCount = 0;
  episode.scenes.forEach((scene, index) => {
    if (scene.sceneNumber !== index + 1) throw new Error(`Day ${expectedDay} scene numbers must cover 1 through 3.`);
    text(scene.title, 1, 200, `day ${expectedDay} scene ${scene.sceneNumber} title`);
    text(scene.setting, 20, 1_000, `day ${expectedDay} scene ${scene.sceneNumber} setting`);
    text(scene.storyBeat, 20, 2_000, `day ${expectedDay} scene ${scene.sceneNumber} storyBeat`);
    if (scene.backgroundElements.length < 2 || scene.backgroundElements.length > 4) throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} requires 2-4 background elements.`);
    scene.backgroundElements.forEach((value, item) => text(value, 3, 300, `day ${expectedDay} scene ${scene.sceneNumber} background ${item + 1}`));
    if (scene.gameplayCues.length < 1 || scene.gameplayCues.length > 4) throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} requires 1-4 factual gameplay cues.`);
    scene.gameplayCues.forEach((value, item) => text(value, 10, 500, `day ${expectedDay} scene ${scene.sceneNumber} gameplay cue ${item + 1}`));
    if (scene.dialogue.length > 4) throw new Error(`Day ${expectedDay} scene ${scene.sceneNumber} may contain at most four dialogue lines.`);
    for (const line of scene.dialogue) {
      text(line.speaker, 1, 100, "dialogue speaker");
      text(line.text, 1, 120, "dialogue text");
      if (!speakers.has(line.speaker.trim().toLocaleLowerCase())) throw new Error(`Unknown scripted speaker: ${line.speaker}.`);
      dialogueCount += 1;
    }
  });
  if (dialogueCount < 3) throw new Error(`Day ${expectedDay} requires at least three purposeful dialogue lines across its script.`);
}

function assertPageFollowsScene(dayNumber: number, scene: SeasonScriptEpisode["scenes"][number], panels: ComicPanelInput[]): void {
  if (panels.length < 4 || panels.length > 6) throw new Error(`Day ${dayNumber} scene ${scene.sceneNumber} requires 4-6 panels.`);
  const plannedDialogue = panels.flatMap(panel => panel.dialogue.map(line => `${line.speaker}\u0000${line.text}`));
  const scriptedDialogue = scene.dialogue.map(line => `${line.speaker}\u0000${line.text}`);
  if (JSON.stringify(plannedDialogue) !== JSON.stringify(scriptedDialogue)) {
    throw new Error(`Day ${dayNumber} scene ${scene.sceneNumber} panels must use the scripted dialogue exactly, in order, without additions.`);
  }
  const cues = new Set(panels.flatMap(panel => panel.gameplayCue ? [panel.gameplayCue] : []));
  const missing = scene.gameplayCues.filter(cue => !cues.has(cue));
  if (missing.length) throw new Error(`Day ${dayNumber} scene ${scene.sceneNumber} is missing scripted gameplay cues: ${missing.join(" | ")}`);
}

function dialogueValidationInput(script: SeasonScriptDraft): ComicPublishInput {
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

function text(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
}
