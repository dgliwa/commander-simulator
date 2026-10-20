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
  story: ComicStoryPlan;
  pages: ComicPageInput[];
}

type ComicPanelDraft = Omit<ComicPanelInput, "dialogue"> & { dialogue?: ComicDialogue[] };
type ComicPageDraft = Omit<ComicPageInput, "setting" | "backgroundElements" | "panels"> & {
  setting?: string;
  backgroundElements?: string[];
  panels: ComicPanelDraft[];
};

export interface ComicPublishDraft extends Omit<ComicPublishInput, "story" | "pages"> {
  story: ComicStoryPlan & { pages?: ComicPageDraft[] };
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

const STYLE_PROFILES: ComicStyleProfile[] = [
  {
    id: "wet-ink-watercolor",
    visualLanguage: "Loose watercolor blooms held by expressive wet-ink contours; airy, imperfect, and visibly handmade rather than polished digital fantasy art.",
    surface: "Visible cold-press paper, pigment pooling, dry-brush edges, and occasional unpainted highlights.",
    layout: "Alternate broad cinematic panels with intimate borderless reaction insets; allow one painted shape to cross a gutter at the climax.",
    colorScript: "Use transparent limited washes, moving from cool quiet hues to one saturated conflict color.",
  },
  {
    id: "scratchboard-noir",
    visualLanguage: "Graphic black-and-white scratchboard fantasy with carved white marks, severe silhouettes, and one sparingly used supernatural accent color.",
    surface: "Dense black fields, etched hatching, rough knife-like highlights, and no soft digital gradients.",
    layout: "Use tall suspense panels, hard shadow shapes, and one stark wide reveal while retaining a clear reading order.",
    colorScript: "Remain nearly monochrome; reserve a single jewel-tone accent for consequential magic and the winner.",
  },
  {
    id: "paper-cut-theatre",
    visualLanguage: "Layered paper-cut theatre with tactile shapes, simplified expressive figures, cast-paper shadows, and ingenious stage-like transformations.",
    surface: "Fibrous colored paper, cut edges, shallow depth, folded props, and practical-looking light.",
    layout: "Treat panels as changing theatre stages with occasional circular peepholes and foreground curtains.",
    colorScript: "Use bold matte color families with strong separation between foreground, midground, and backdrop.",
  },
  {
    id: "risograph-space-fantasy",
    visualLanguage: "Energetic risograph sequential art using chunky shapes, loose registration, halftone texture, and playful science-fantasy exaggeration.",
    surface: "Two-to-four ink layers, visible dot screens, offset edges, and economical detail.",
    layout: "Use modular panels, oversized reaction close-ups, and graphic arrows made from environmental motion—not UI.",
    colorScript: "Choose a surprising limited ink set such as fluorescent pink, teal, mustard, and deep navy.",
  },
  {
    id: "illuminated-manuscript",
    visualLanguage: "An original illuminated-fantasy manuscript translated into sequential art, with decorative borders, flattened perspective, symbolic scale, and lively marginal action.",
    surface: "Parchment grain, opaque mineral pigments, restrained gold-like ornament, and fine hand-drawn pattern.",
    layout: "Use framed tableaux, small marginal reaction scenes, and a large ceremonial climax panel.",
    colorScript: "Favor lapis blue, vermilion, leaf green, parchment, and restrained luminous accents.",
  },
  {
    id: "charcoal-pastel",
    visualLanguage: "Raw charcoal gesture drawing sharpened by selective chalk pastel, dramatic erasures, broad anatomy, and emotionally forceful faces.",
    surface: "Smudged toothy paper, powdery marks, fingerprints, erased light, and broken contours.",
    layout: "Mix aggressive diagonal crops with breathing-room panels; let charcoal dust become motion between panels.",
    colorScript: "Keep charcoal dominant and use two pastel colors that intensify around major game swings.",
  },
  {
    id: "woodblock-fantasy",
    visualLanguage: "Original multi-block print fantasy with decisive carved contours, patterned weather, flattened depth, and elegant rhythmic movement.",
    surface: "Wood-grain impressions, hand-printed color variation, crisp carved textures, and broad flat shapes.",
    layout: "Use asymmetrical compositions, strong diagonals, and scenic negative space around decisive gestures.",
    colorScript: "Use a restrained print palette with commander-specific pattern and color accents.",
  },
  {
    id: "retro-screenprint",
    visualLanguage: "Bold retro science-fantasy screenprint comic with geometric anatomy, optimistic shapes, strange machinery, and crisp editorial design.",
    surface: "Flat screenprinted inks, coarse halftones, overprint effects, and no glossy painterly rendering.",
    layout: "Use clean grids interrupted by one poster-like full-width image and small diagrammatic detail panels without labels.",
    colorScript: "Use cream, ink black, burnt orange, turquoise, and one electric accent.",
  },
  {
    id: "gouache-storybook",
    visualLanguage: "Warm gouache storybook sequential art with chunky brush shapes, whimsical but credible acting, and richly observed environments.",
    surface: "Opaque brush strokes, visible corrections, painted paper grain, and simplified edges.",
    layout: "Use varied rectangles, occasional object-shaped insets, and a calm panoramic aftermath panel.",
    colorScript: "Start earthy, deepen into stormy middle values, and finish with a clear unexpected accent.",
  },
  {
    id: "miniature-diorama",
    visualLanguage: "Photographed handcrafted miniature-diorama sequential art with sculpted characters, practical effects, dramatic depth of field, and theatrical physical sets.",
    surface: "Painted resin and clay figures, model foliage, cotton smoke, tiny practical lights, and visible handcrafted detail.",
    layout: "Use wide set-establishing panels, macro reaction close-ups, and low-angle miniature photography for the climax.",
    colorScript: "Let practical lighting shift from ambient set color to vivid magical illumination.",
  },
];

const BACKGROUND_PROFILES: ComicBackgroundProfile[] = [
  {
    id: "deep-stage",
    direction: "Build deep, explorable environments with distinct foreground props, midground action, and far-background landmarks; avoid empty fog or generic arena walls.",
    composition: "Change camera height and depth plane between panels, including one true wide establishing view per page.",
  },
  {
    id: "living-world",
    direction: "Make the environment react to events through weather, wildlife, crowds, plants, debris, and shifting light so backgrounds visibly evolve with the game.",
    composition: "Carry one environmental reaction across consecutive panels, then reveal its changed state in a later wide shot.",
  },
  {
    id: "architectural-cutaway",
    direction: "Use distinctive architecture, rooms, bridges, stairs, and cutaway spaces; every location must have a readable function and memorable silhouette.",
    composition: "Move action through connected spaces and use at least one overhead or cutaway composition per page.",
  },
  {
    id: "weather-dominant",
    direction: "Let a specific weather system and time-of-day progression shape every location, surface, silhouette, and source of light.",
    composition: "Contrast exposed wides with sheltered close scenes, making the weather materially change by the page climax.",
  },
  {
    id: "colossal-scale",
    direction: "Stage events against enormous terrain, machines, creatures, or ruins that provide unmistakable scale rather than a generic fantasy vista.",
    composition: "Alternate tiny figures in vast spaces with extreme close-ups that reveal tactile environmental detail.",
  },
  {
    id: "intimate-clutter",
    direction: "Favor specific lived-in spaces full of story-bearing tools, food, trophies, damaged furniture, maps without readable text, and personal artifacts.",
    composition: "Use foreground objects as frames and transitions while keeping action silhouettes readable.",
  },
  {
    id: "graphic-negative-space",
    direction: "Build memorable backgrounds from bold negative space, isolated landmarks, patterned terrain, and sharply controlled silhouettes instead of routine scenic detail.",
    composition: "Vary dense and sparse panels deliberately; reserve the emptiest composition for a major reversal.",
  },
  {
    id: "surreal-transformation",
    direction: "Allow the physical setting to transform metaphorically with factual game events—terrain folds, structures awaken, pathways fracture—while characters remain continuous.",
    composition: "Show the same landmark before and after transformation so the game-driven change is unmistakable.",
  },
];

export function normalizeComicInput(input: ComicPublishDraft): ComicPublishInput {
  const nestedPages = input.story?.pages;
  const sourcePages = input.pages ?? nestedPages;
  const story = { ...input.story } as ComicStoryPlan & { pages?: ComicPageDraft[] };
  delete story.pages;
  return {
    ...input,
    story,
    pages: (sourcePages ?? []).map((page) => ({
      ...page,
      setting: page.setting ?? `A distinct location derived from this story beat: ${page.storyBeat}`,
      backgroundElements: page.backgroundElements ?? ["a recurring continuity landmark", "environmental evidence of the current conflict"],
      panels: page.panels.map((panel) => ({ ...panel, dialogue: panel.dialogue ?? [] })),
    })),
  };
}

export function selectComicStyle(runId: string): ComicStyleProfile {
  return STYLE_PROFILES[stableHash(`style:${runId}`) % STYLE_PROFILES.length]!;
}

export function selectComicBackground(runId: string): ComicBackgroundProfile {
  return BACKGROUND_PROFILES[stableHash(`background:${runId}`) % BACKGROUND_PROFILES.length]!;
}

export function validateComicInput(input: ComicPublishInput): void {
  if (input.confirmed !== true) throw new Error("Comic rendering and Discord delivery require confirmed=true.");
  if (!/^[0-9a-f-]{36}$/i.test(input.runId)) throw new Error("runId must be a simulator UUID.");
  safeText(input.summary, 1, 8_000, "summary");
  safeText(input.continuityGuide, 200, 12_000, "continuityGuide");
  safeText(input.story.title, 1, 300, "story.title");
  safeText(input.story.premise, 20, 2_000, "story.premise");
  safeText(input.story.dramaticQuestion, 10, 1_000, "story.dramaticQuestion");
  if (input.story.personaDirections.length < 2 || input.story.personaDirections.length > 8) {
    throw new Error("story.personaDirections must contain 2-8 participants.");
  }
  const deckNames = new Set<string>();
  const commanderNames = new Set<string>();
  for (const direction of input.story.personaDirections) {
    safeText(direction.deckName, 1, 300, "persona deckName");
    safeText(direction.commanderName, 1, 300, "persona commanderName");
    safeText(direction.role, 3, 500, `${direction.commanderName} role`);
    safeText(direction.voice, 3, 500, `${direction.commanderName} voice`);
    const deckKey = direction.deckName.trim().toLocaleLowerCase();
    if (deckNames.has(deckKey)) throw new Error(`Duplicate deck direction: ${direction.deckName}.`);
    deckNames.add(deckKey);
    const commanderKey = direction.commanderName.trim().toLocaleLowerCase();
    if (commanderNames.has(commanderKey)) throw new Error(`Duplicate commander direction: ${direction.commanderName}.`);
    commanderNames.add(commanderKey);
  }
  if (input.pages.length < 3 || input.pages.length > 4) throw new Error("Comic must contain 3-4 pages.");
  const pageNumbers = new Set<number>();
  const settings = new Set<string>();
  let dialogueCount = 0;
  let gameplayCueCount = 0;
  for (const page of input.pages) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 4) {
      throw new Error("pageNumber must be an integer from 1 to 4.");
    }
    if (pageNumbers.has(page.pageNumber)) throw new Error(`Duplicate page number ${page.pageNumber}.`);
    pageNumbers.add(page.pageNumber);
    safeText(page.title, 1, 200, `page ${page.pageNumber} title`);
    safeText(page.storyBeat, 20, 2_000, `page ${page.pageNumber} storyBeat`);
    safeText(page.setting, 20, 1_000, `page ${page.pageNumber} setting`);
    settings.add(page.setting.trim().toLocaleLowerCase());
    if (page.backgroundElements.length < 2 || page.backgroundElements.length > 4) {
      throw new Error(`Page ${page.pageNumber} must contain 2-4 background elements.`);
    }
    page.backgroundElements.forEach((element, index) => safeText(element, 3, 300, `page ${page.pageNumber} background element ${index + 1}`));
    if (page.panels.length < 4 || page.panels.length > 6) throw new Error(`Page ${page.pageNumber} must contain 4-6 panels.`);
    let pageGameplayCues = 0;
    for (const [index, panel] of page.panels.entries()) {
      safeText(panel.visual, 20, 3_000, `page ${page.pageNumber} panel ${index + 1} visual`);
      if (panel.gameplayCue !== undefined) {
        safeText(panel.gameplayCue, 10, 500, `page ${page.pageNumber} panel ${index + 1} gameplayCue`);
        pageGameplayCues += 1;
        gameplayCueCount += 1;
      }
      if (panel.caption !== undefined) safeText(panel.caption, 1, 300, `page ${page.pageNumber} panel ${index + 1} caption`);
      if (panel.dialogue.length > 2) throw new Error(`Page ${page.pageNumber} panel ${index + 1} may contain at most two dialogue lines.`);
      for (const dialogue of panel.dialogue) {
        safeText(dialogue.speaker, 1, 100, `page ${page.pageNumber} panel ${index + 1} speaker`);
        safeText(dialogue.text, 1, 120, `page ${page.pageNumber} panel ${index + 1} dialogue`);
        dialogueCount += 1;
      }
    }
    if (pageGameplayCues < 1) throw new Error(`Page ${page.pageNumber} must contain at least one factual gameplayCue.`);
  }
  if (settings.size < 2) throw new Error("The comic must use at least two visibly distinct page settings.");
  if (gameplayCueCount < input.pages.length) throw new Error("The comic must contain at least one factual gameplay cue per page.");
  if (dialogueCount < input.pages.length) throw new Error("The comic must average at least one dialogue line per page.");
  rejectDeckNamesAsCharacters(input);
}

export function composePagePrompt(
  input: ComicPublishInput,
  page: ComicPageInput,
  style = selectComicStyle(input.runId),
  background = selectComicBackground(input.runId),
): string {
  const personaDirections = input.story.personaDirections
    .map((direction) => `- ${direction.commanderName} / ${direction.persona}: ${direction.role}. Voice: ${direction.voice}`)
    .join("\n");
  const gameplayAnchors = page.panels
    .flatMap((panel, index) => panel.gameplayCue ? [`- Panel ${index + 1}: ${panel.gameplayCue}`] : [])
    .join("\n");
  const panels = page.panels.map((panel, index) => {
    const gameplay = panel.gameplayCue ? ` Diegetic gameplay cue, clearly visible: ${panel.gameplayCue}` : "";
    const caption = panel.caption ? ` Caption exactly: “${panel.caption}”` : "";
    const dialogue = panel.dialogue.length
      ? ` Dialogue exactly: ${panel.dialogue.map((line) => `${line.speaker}: “${line.text}”`).join(" | ")}`
      : " No dialogue in this panel.";
    return `${index + 1}. ${panel.visual}${gameplay}${caption}${dialogue}`;
  }).join("\n");
  return [
    "Create an ORIGINAL sequential-art comic page in portrait 2:3 layout.",
    `DAILY MEDIUM AND STYLE — ${style.id}: ${style.visualLanguage}`,
    `PHYSICAL SURFACE: ${style.surface}`,
    `LAYOUT RHYTHM: ${style.layout}`,
    `COLOR SCRIPT: ${style.colorScript}`,
    "Commit strongly to this medium. Do not fall back to generic polished digital fantasy painting, generic cinematic concept art, or the visual style of previous pages outside this run.",
    `BACKGROUND STRATEGY — ${background.id}: ${background.direction}`,
    `BACKGROUND COMPOSITION: ${background.composition}`,
    `PAGE SETTING: ${page.setting}`,
    `REQUIRED BACKGROUND ELEMENTS: ${page.backgroundElements.join("; ")}`,
    "Make the setting specific and unmistakable in every panel. Vary camera distance, angle, depth, lighting, and visible landmarks; do not use empty haze, interchangeable stone arenas, or generic blurred scenery.",
    "Maintain expressive faces, readable silhouettes, clean gutters, and natural reading order.",
    "Do not reproduce Magic card frames, logos, existing card illustrations, named living artists, or existing comic art.",
    "The commanders are the acting characters. Never portray or name a deck title as if it were a person.",
    "Gameplay references must be legible to a player while remaining diegetic: show factual casting, summoning, attacks, blocks, removal, sacrifice, graveyard return, mana use, or commander damage as physical story actions. Do not merely add vague glowing magic. Never show game UI, life totals, cards, rules text, speech-balloon speaker labels, or floating ability names.",
    `FACTUAL GAMEPLAY ANCHORS FOR THIS PAGE:\n${gameplayAnchors}`,
    `STORY: ${input.story.title}`,
    `PREMISE: ${input.story.premise}`,
    `DRAMATIC QUESTION: ${input.story.dramaticQuestion}`,
    `COMMANDER PERSONAS:\n${personaDirections}`,
    `CONTINUITY GUIDE — follow exactly on this page:\n${input.continuityGuide}`,
    `PAGE ${page.pageNumber}: ${page.title}`,
    `STORY BEAT: ${page.storyBeat}`,
    `Render exactly ${page.panels.length} clearly separated panels:\n${panels}`,
    "All visible text must be only the exact supplied captions and dialogue. Keep lettering short and legible. Do not add card-game names, labels, sound effects, title text, page numbers, signatures, or watermarks.",
  ].join("\n\n");
}

function rejectDeckNamesAsCharacters(input: ComicPublishInput): void {
  const narrativeText = [
    input.continuityGuide,
    input.story.premise,
    input.story.dramaticQuestion,
    ...input.pages.flatMap((page) => [
      page.title,
      page.storyBeat,
      page.setting,
      ...page.backgroundElements,
      ...page.panels.flatMap((panel) => [
        panel.visual,
        panel.gameplayCue ?? "",
        panel.caption ?? "",
        ...panel.dialogue.flatMap((dialogue) => [dialogue.speaker, dialogue.text]),
      ]),
    ]),
  ].join("\n").toLocaleLowerCase();
  for (const direction of input.story.personaDirections) {
    const deckName = direction.deckName.trim().toLocaleLowerCase();
    const commanderName = direction.commanderName.trim().toLocaleLowerCase();
    const withoutCommanderReferences = narrativeText.replaceAll(commanderName, "");
    if (deckName !== commanderName && withoutCommanderReferences.includes(deckName)) {
      throw new Error(`Comic narrative must use commander ${direction.commanderName}, not deck title ${direction.deckName}, as the character.`);
    }
  }
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeText(value: string, minimum: number, maximum: number, label: string): void {
  const text = value?.trim();
  if (!text || text.length < minimum || text.length > maximum || text.includes("\0")) {
    throw new Error(`${label} must contain ${minimum}-${maximum} safe characters.`);
  }
}
