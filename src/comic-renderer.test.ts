import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ComicPublisher } from "./comic-publisher.js";
import { ComicRenderer, type CommandRunner } from "./comic-renderer.js";
import {
  composePagePrompt,
  normalizeComicInput,
  selectComicBackground,
  selectComicStyle,
  type ComicPublishInput,
  validateComicInput,
} from "./comic-types.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(failPage?: number) {
  const root = mkdtempSync(join(tmpdir(), "commander-comic-"));
  roots.push(root);
  const calls: string[][] = [];
  const runner: CommandRunner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "infer") {
      const output = args[args.indexOf("--output") + 1];
      const page = Number(output.match(/page-(\d+)\.png$/)?.[1]);
      if (page === failPage) throw new Error("provider failed");
      writeFileSync(output, pngHeader(1024, 1536));
      return { stdout: JSON.stringify({ ok: true, output }), stderr: "" };
    }
    return { stdout: JSON.stringify({ deliveryStatus: "sent", messageId: "123" }), stderr: "" };
  };
  return { root, calls, renderer: new ComicRenderer(root, "channel:1560498017394499706", "openclaw", runner) };
}

function input(): ComicPublishInput {
  return {
    confirmed: true,
    runId: "aee8847f-f6b9-44bd-88b3-7b1b005a108d",
    summary: "Game summary",
    continuityGuide: "A consistent original fantasy arena with four recurring champions, stable costumes, stable color palettes, expressive faces, and no borrowed card artwork. Repeat every identifying detail across all pages and panels.",
    story: {
      title: "The Last Counterspell",
      premise: "Four rival champions enter a shifting arena, but patient preparation threatens to outlast early aggression.",
      dramaticQuestion: "Can the cautious mage survive long enough to turn the final battle?",
      personaDirections: [
        { deckName: "Alpha", commanderName: "Aria, Flame Captain", persona: "Reckless", role: "The aggressive challenger", voice: "Bold, impatient, and provocative" },
        { deckName: "Beta", commanderName: "Borin, Tide Warden", persona: "Cautious", role: "The patient defender", voice: "Measured, observant, and concise" },
      ],
    },
    pages: [1, 2, 3].map(pageNumber => ({
      pageNumber,
      title: `Page ${pageNumber}`,
      storyBeat: `This page advances the conflict through a factual turning point number ${pageNumber}.`,
      setting: `Distinct battlefield location ${pageNumber} with a changed horizon, weather, and terrain state.`,
      backgroundElements: [`landmark ${pageNumber}`, `weather state ${pageNumber}`],
      panels: [1, 2, 3, 4].map(panel => ({
        visual: `Panel ${panel} shows the recurring champions acting on one recorded battlefield event with clear emotional stakes.`,
        gameplayCue: panel === 1 ? `Aria visibly spends gathered fire mana to cast the recorded spell on turn ${pageNumber}.` : undefined,
        caption: panel === 1 ? `Turning point ${pageNumber}` : undefined,
        dialogue: panel === 2 ? [{ speaker: "Aria, Flame Captain", text: "Tapped out? How generous." }] : [],
      })),
    })),
  };
}

describe("ComicRenderer", () => {
  test("renders sequential pages, saves progress, and sends one Discord message", async () => {
    const { root, calls, renderer } = fixture();
    const result = await renderer.publish(input());
    expect(result.rendered).toHaveLength(3);
    expect(result.failed).toEqual([]);
    expect(calls.map(call => call.slice(0, 3))).toEqual([
      ["message", "send", "--channel"],
      ["infer", "image", "generate"],
      ["infer", "image", "generate"],
      ["infer", "image", "generate"],
      ["message", "send", "--channel"],
    ]);
    expect(calls[4].filter(value => value === "--media")).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(root, input().runId, "manifest.json"), "utf8")).status).toBe("completed");
  });

  test("reuses valid existing pages during a retry", async () => {
    const { calls, renderer } = fixture();
    await renderer.publish(input());
    calls.length = 0;
    const result = await renderer.publish(input());
    expect(result.rendered.every((page: any) => page.reused)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(["message", "send"]);
    expect(calls[1].slice(0, 2)).toEqual(["message", "send"]);
  });

  test("continues after one page failure and reports a partial package", async () => {
    const { calls, renderer } = fixture(2);
    const result = await renderer.publish(input());
    expect(result.rendered.map((page: any) => page.pageNumber)).toEqual([1, 3]);
    expect(result.failed).toEqual([{ pageNumber: 2, error: "provider failed" }]);
    expect(calls.filter(call => call[0] === "infer" && call.some(value => value.endsWith("page-2.png")))).toHaveLength(2);
    const send = calls.at(-1)!;
    expect(send[send.indexOf("--message") + 1]).toContain("page 2 failed");
    expect(send.filter(value => value === "--media")).toHaveLength(2);
  });

  test("composes commander-led narrative with subtle game references and without UI", () => {
    const source = input();
    const prompt = composePagePrompt(source, source.pages[0]);
    expect(prompt).toContain("Aria, Flame Captain / Reckless");
    expect(prompt).not.toContain("- Alpha / Reckless");
    expect(prompt).toContain("Aria, Flame Captain: “Tapped out? How generous.”");
    expect(prompt).toContain("FACTUAL GAMEPLAY ANCHORS FOR THIS PAGE");
    expect(prompt).toContain("Aria visibly spends gathered fire mana");
    expect(prompt).toContain("REQUIRED BACKGROUND ELEMENTS");
    expect(prompt).toContain("Never show game UI, life totals");
  });

  test("rejects deck names used as acting comic characters", () => {
    const source = input();
    source.pages[0].panels[0].dialogue = [{ speaker: "Alpha", text: "I attack." }];
    expect(() => validateComicInput(source)).toThrow("must use commander Aria, Flame Captain");
  });

  test("normalizes nested pages and missing dialogue before validation", () => {
    const source = input();
    const draft: any = {
      ...source,
      story: { ...source.story, pages: source.pages.map(page => ({
        ...page,
        panels: page.panels.map(({ dialogue: _dialogue, ...panel }) => panel),
      })) },
    };
    delete draft.pages;
    const normalized = normalizeComicInput(draft);
    expect(normalized.story).not.toHaveProperty("pages");
    expect(normalized.pages[0].panels[0].dialogue).toEqual([]);
    expect(() => validateComicInput(normalized)).toThrow("average at least one dialogue line per page");
  });

  test("selects a stable rotating art direction per run", () => {
    const first = selectComicStyle(input().runId);
    const background = selectComicBackground(input().runId);
    expect(selectComicStyle(input().runId)).toEqual(first);
    expect(selectComicBackground(input().runId)).toEqual(background);
    const prompt = composePagePrompt(input(), input().pages[0]);
    expect(prompt).toContain(`DAILY MEDIUM AND STYLE — ${first.id}`);
    expect(prompt).toContain(`BACKGROUND STRATEGY — ${background.id}`);
  });

  test("requires factual gameplay cues and varied page settings", () => {
    const missingCue = input();
    missingCue.pages[0].panels.forEach(panel => { delete panel.gameplayCue; });
    expect(() => validateComicInput(missingCue)).toThrow("at least one factual gameplayCue");

    const repeatedSetting = input();
    repeatedSetting.pages.forEach(page => { page.setting = "The same unchanged generic battlefield location on every page."; });
    expect(() => validateComicInput(repeatedSetting)).toThrow("at least two visibly distinct page settings");
  });

  test("rejects a fifth comic page", () => {
    const source = input();
    source.pages.push({ ...source.pages[0], pageNumber: 4 }, { ...source.pages[0], pageNumber: 5 });
    expect(() => validateComicInput(source)).toThrow("Comic must contain 3-4 pages.");
  });

  test("queues detached publication immediately and suppresses duplicate launches", () => {
    const root = mkdtempSync(join(tmpdir(), "commander-publisher-"));
    roots.push(root);
    const launches: string[] = [];
    const publisher = new ComicPublisher(root, "channel:1560498017394499706", "openclaw", requestPath => {
      launches.push(requestPath);
      return 4242;
    });
    const first = publisher.enqueue(input());
    const second = publisher.enqueue(input());
    expect(first).toMatchObject({ accepted: true, status: "queued", workerPid: 4242 });
    expect(second).toMatchObject({ accepted: false, status: "queued", workerPid: 4242 });
    expect(launches).toHaveLength(1);
  });
});

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
