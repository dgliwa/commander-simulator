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
  for (const direction of input.story.personaDirections) {
    safeText(direction.deckName, 1, 300, "persona deckName");
    safeText(direction.role, 3, 500, `${direction.deckName} role`);
    safeText(direction.voice, 3, 500, `${direction.deckName} voice`);
    const key = direction.deckName.trim().toLocaleLowerCase();
    if (deckNames.has(key)) throw new Error(`Duplicate persona direction for ${direction.deckName}.`);
    deckNames.add(key);
  }
  if (input.pages.length < 3 || input.pages.length > 5) throw new Error("Comic publication requires 3-5 pages.");
  const pageNumbers = new Set<number>();
  let dialogueCount = 0;
  for (const page of input.pages) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 5) {
      throw new Error("pageNumber must be an integer from 1 to 5.");
    }
    if (pageNumbers.has(page.pageNumber)) throw new Error(`Duplicate comic page number ${page.pageNumber}.`);
    pageNumbers.add(page.pageNumber);
    safeText(page.title, 1, 200, `page ${page.pageNumber} title`);
    safeText(page.storyBeat, 20, 2_000, `page ${page.pageNumber} storyBeat`);
    if (page.panels.length < 4 || page.panels.length > 6) {
      throw new Error(`Page ${page.pageNumber} must contain 4-6 panels.`);
    }
    for (const [index, panel] of page.panels.entries()) {
      safeText(panel.visual, 20, 3_000, `page ${page.pageNumber} panel ${index + 1} visual`);
      if (panel.caption !== undefined) safeText(panel.caption, 1, 300, `page ${page.pageNumber} panel ${index + 1} caption`);
      if (panel.dialogue.length > 2) throw new Error(`Page ${page.pageNumber} panel ${index + 1} may contain at most two dialogue lines.`);
      for (const dialogue of panel.dialogue) {
        safeText(dialogue.speaker, 1, 100, `page ${page.pageNumber} panel ${index + 1} speaker`);
        safeText(dialogue.text, 1, 120, `page ${page.pageNumber} panel ${index + 1} dialogue`);
        dialogueCount += 1;
      }
    }
  }
  if (dialogueCount < input.pages.length) {
    throw new Error("The comic must average at least one dialogue line per page.");
  }
}

export function composePagePrompt(input: ComicPublishInput, page: ComicPageInput): string {
  const personaDirections = input.story.personaDirections
    .map(direction => `- ${direction.deckName} / ${direction.persona}: ${direction.role}. Voice: ${direction.voice}`)
    .join("\n");
  const panels = page.panels.map((panel, index) => {
    const caption = panel.caption ? ` Caption exactly: “${panel.caption}”` : "";
    const dialogue = panel.dialogue.length
      ? ` Dialogue exactly: ${panel.dialogue.map(line => `${line.speaker}: “${line.text}”`).join(" | ")}`
      : " No dialogue in this panel.";
    return `${index + 1}. ${panel.visual}${caption}${dialogue}`;
  }).join("\n");
  return [
    "Create an ORIGINAL high-end American superhero/fantasy comic page in a portrait 2:3 layout.",
    "Use confident clean ink, cinematic painterly color, expressive faces, readable silhouettes, clean gutters, and a natural reading order.",
    "Do not reproduce Magic card frames, logos, existing card illustrations, or existing comic art.",
    "Render only the exact short captions and dialogue supplied below. Do not add life-total boxes, game UI, rules text, or unrequested lettering.",
    `Series title: ${input.story.title}`,
    `Premise: ${input.story.premise}`,
    `Dramatic question: ${input.story.dramaticQuestion}`,
    "Recurring cast and persona direction:",
    personaDirections,
    "Visual continuity guide:",
    input.continuityGuide,
    `Page ${page.pageNumber}: ${page.title}`,
    `Story beat: ${page.storyBeat}`,
    `Use exactly ${page.panels.length} panels:`,
    panels,
    "Preserve factual actions and outcomes. Dialogue may dramatize intent and emotion but must not invent unlogged spells, deals, eliminations, or winners.",
  ].join("\n\n");
}

function safeText(value: string, minimum: number, maximum: number, label: string): void {
  const text = value?.trim();
  if (!text || text.length < minimum || text.length > maximum || text.includes("\0")) {
    throw new Error(`${label} must contain ${minimum}-${maximum} safe characters.`);
  }
}
