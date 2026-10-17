import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ComicPublisher } from "./comic-publisher.js";
import { ComicRenderer, type CommandRunner } from "./comic-renderer.js";
import { composePagePrompt, type ComicPublishInput } from "./comic-types.js";

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
        { deckName: "Alpha", persona: "Reckless", role: "The aggressive challenger", voice: "Bold, impatient, and provocative" },
        { deckName: "Beta", persona: "Cautious", role: "The patient defender", voice: "Measured, observant, and concise" },
      ],
    },
    pages: [1, 2, 3].map(pageNumber => ({
      pageNumber,
      title: `Page ${pageNumber}`,
      storyBeat: `This page advances the conflict through a factual turning point number ${pageNumber}.`,
      panels: [1, 2, 3, 4].map(panel => ({
        visual: `Panel ${panel} shows the recurring champions acting on one recorded battlefield event with clear emotional stakes.`,
        caption: panel === 1 ? `Turning point ${pageNumber}` : undefined,
        dialogue: panel === 2 ? [{ speaker: "Alpha", text: "Now the field is mine." }] : [],
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
      ["infer", "image", "generate"],
      ["infer", "image", "generate"],
      ["infer", "image", "generate"],
      ["message", "send", "--channel"],
    ]);
    expect(calls[3].filter(value => value === "--media")).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(root, input().runId, "manifest.json"), "utf8")).status).toBe("completed");
  });

  test("reuses valid existing pages during a retry", async () => {
    const { calls, renderer } = fixture();
    await renderer.publish(input());
    calls.length = 0;
    const result = await renderer.publish(input());
    expect(result.rendered.every((page: any) => page.reused)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(["message", "send"]);
  });

  test("continues after one page failure and reports a partial package", async () => {
    const { calls, renderer } = fixture(2);
    const result = await renderer.publish(input());
    expect(result.rendered.map((page: any) => page.pageNumber)).toEqual([1, 3]);
    expect(result.failed).toEqual([{ pageNumber: 2, error: "provider failed" }]);
    const send = calls.at(-1)!;
    expect(send[send.indexOf("--message") + 1]).toContain("page 2 failed");
    expect(send.filter(value => value === "--media")).toHaveLength(2);
  });

  test("composes prompts with persona voices and exact dialogue without game UI", () => {
    const source = input();
    const prompt = composePagePrompt(source, source.pages[0]);
    expect(prompt).toContain("Alpha / Reckless");
    expect(prompt).toContain("Alpha: “Now the field is mine.”");
    expect(prompt).toContain("Do not add life-total boxes");
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
