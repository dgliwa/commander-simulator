import { selectComicBackground, selectComicStyle } from "./comic-types.js";

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

export function validateSeasonCoverInput(input: SeasonCoverInput): void {
  if (input.confirmed !== true) throw new Error("Season cover rendering requires confirmed=true.");
  if (!/^[0-9a-f-]{36}$/i.test(input.seasonId)) throw new Error("seasonId must be a UUID.");
  safeText(input.seasonTitle, 1, 300, "seasonTitle");
  safeText(input.premise, 20, 2_000, "premise");
  safeText(input.dramaticQuestion, 10, 500, "dramaticQuestion");
  safeText(input.continuityGuide, 200, 12_000, "continuityGuide");
  safeText(input.artDirectionSeed, 1, 200, "artDirectionSeed");
  if (input.characters.length !== 6) throw new Error("Season cover requires exactly six recurring commanders.");
  if (input.characters.filter(character => character.role === "hero").length !== 2) {
    throw new Error("Season cover requires exactly two heroes.");
  }
  if (input.characters.filter(character => character.role === "rival").length !== 4) {
    throw new Error("Season cover requires exactly four rivals.");
  }
  const names = new Set<string>();
  for (const character of input.characters) {
    safeText(character.commanderName, 1, 300, "character.commanderName");
    const key = character.commanderName.trim().toLocaleLowerCase();
    if (names.has(key)) throw new Error(`Duplicate season cover commander: ${character.commanderName}.`);
    names.add(key);
  }
}

export function composeSeasonCoverPrompt(input: SeasonCoverInput): string {
  validateSeasonCoverInput(input);
  const style = selectComicStyle(input.artDirectionSeed);
  const background = selectComicBackground(input.artDirectionSeed);
  const heroes = input.characters.filter(character => character.role === "hero").map(character => character.commanderName);
  const rivals = input.characters.filter(character => character.role === "rival").map(character => character.commanderName);
  return `Create one vertical 1024x1536 illustrated cover for an original seven-day Commander fantasy serial.

TITLE — Render this exact title clearly once in a strong hand-lettered display treatment near the top: “${input.seasonTitle}”
SUBTITLE — Render this exact smaller line once: “A Seven-Day Commander Story”
Do not render any other words, logos, card frames, rules text, scores, UI, watermarks, or publisher marks.

STAGE-SETTING PREMISE
${input.premise}
Dramatic question: ${input.dramaticQuestion}

CAST
The two central protagonists must dominate the foreground: ${heroes.join(" and ")}.
The four recurring rivals must all be recognizable in the middle or background: ${rivals.join(", ")}.
Show all six commanders exactly once. Do not substitute deck names, generic soldiers, or unrelated characters.

SERIES CONTINUITY BIBLE
${input.continuityGuide}

LOCKED MEDIUM AND STYLE — ${style.id}
${style.visualLanguage}
Surface: ${style.surface}
Cover composition: ${style.layout}
Color script: ${style.colorScript}

LOCKED ENVIRONMENT STRATEGY — ${background.id}
${background.direction}
Composition: ${background.composition}

This is a single full-bleed cover image, not a comic page: no panels, gutters, speech balloons, captions, montage boxes, or game interface. Establish the principal location and conflict without revealing winners or later plot outcomes. Make the two heroes immediately legible as protagonists while allowing all four rivals equal recurring-character specificity. Use original visual interpretation rather than copied card artwork.`;
}

function safeText(value: string, minimum: number, maximum: number, label: string): void {
  const length = value.trim().length;
  if (length < minimum || length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
}
