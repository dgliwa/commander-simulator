import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CommandRunner } from "./comic-renderer.js";
import { SeasonCoverPublisher } from "./season-cover-publisher.js";
import { SeasonCoverRenderer } from "./season-cover-renderer.js";
import { composeSeasonCoverPrompt, type SeasonCoverInput } from "./season-cover-types.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function input(): SeasonCoverInput {
  return {
    confirmed: true,
    seasonId: "32389215-23f1-4169-a0cc-5859af545fe7",
    seasonTitle: "Ashes Over the Green Meridian",
    premise: "Two unlikely heroes cross a rain-struck meridian while four recurring rivals compete to control its awakening roads.",
    dramaticQuestion: "Can the heroes preserve their fellowship when every victory changes the land beneath them?",
    continuityGuide: "Keep all six recurring commanders visually stable throughout the weekly story. Preserve exact silhouettes, clothing, equipment, relative scale, color accents, facial features, recurring landmarks, weather progression, and prior injuries. The heroes occupy the visual foreground while each rival retains a distinct silhouette and recurring environmental motif across the complete serial.",
    artDirectionSeed: "32389215-23f1-4169-a0cc-5859af545fe7",
    characters: [
      { commanderName: "Bard, King of Dale", role: "hero" },
      { commanderName: "Galadriel, Elven-Queen", role: "hero" },
      { commanderName: "Drakuseth, Maw of Flames", role: "rival" },
      { commanderName: "Terrian, World Tyrant", role: "rival" },
      { commanderName: "Kitsa, Otterball Elite", role: "rival" },
      { commanderName: "Obeka, Brute Chronologist", role: "rival" },
    ],
  };
}

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("Season cover", () => {
  test("builds a spoiler-free single-cover prompt with the complete cast", () => {
    const prompt = composeSeasonCoverPrompt(input());
    expect(prompt).toContain("Ashes Over the Green Meridian");
    expect(prompt).toContain("The title must be the only text in the image");
    expect(prompt).not.toContain("A Seven-Day Commander Story");
    expect(prompt).toContain("Never mention Commander, Magic: The Gathering, games, players, turns, decks, episodes");
    expect(prompt).toContain("Bard, King of Dale and Galadriel, Elven-Queen");
    expect(prompt).toContain("Drakuseth, Maw of Flames");
    expect(prompt).toContain("no panels, gutters, speech balloons");
    expect(prompt).toContain("without revealing winners");
  });

  test("renders one reusable cover and sends it to Discord", async () => {
    const root = mkdtempSync(join(tmpdir(), "commander-cover-"));
    roots.push(root);
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args);
      if (args[0] === "infer") {
        const output = args[args.indexOf("--output") + 1]!;
        writeFileSync(output, pngHeader(1024, 1536));
        return { stdout: JSON.stringify({ ok: true, output }), stderr: "" };
      }
      return { stdout: JSON.stringify({ deliveryStatus: "sent" }), stderr: "" };
    };
    const renderer = new SeasonCoverRenderer(root, "channel:1560498017394499706", "openclaw", runner);
    const first = await renderer.publish(input());
    expect(first.status).toBe("completed");
    expect(calls.map(call => call.slice(0, 2))).toEqual([["infer", "image"], ["message", "send"]]);
    const manifestPath = join(root, "seasons", input().seasonId, "cover", "manifest.json");
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).status).toBe("completed");

    calls.length = 0;
    const second = await renderer.publish(input());
    expect(second.reused).toBe(true);
    expect(calls.map(call => call.slice(0, 2))).toEqual([["message", "send"]]);
  });

  test("publisher queues at most one detached worker", () => {
    const root = mkdtempSync(join(tmpdir(), "commander-cover-publisher-"));
    roots.push(root);
    const launches: string[] = [];
    const publisher = new SeasonCoverPublisher(root, "channel:1560498017394499706", "openclaw", requestPath => {
      launches.push(requestPath);
      return 4242;
    });
    expect(publisher.enqueue(input())).toMatchObject({ accepted: true, status: "queued", workerPid: 4242 });
    expect(publisher.enqueue(input())).toMatchObject({ accepted: false, status: "queued", workerPid: 4242 });
    expect(launches).toHaveLength(1);
  });
});
