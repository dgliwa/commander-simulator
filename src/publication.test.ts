import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT, runPublicationCli } from "./publication.js";

const RUN_ID = "40706e8d-23fa-4c32-9182-61966aed3650";
let root: string;
let runDirectory: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "comic-publication-"));
  runDirectory = join(root, RUN_ID);
  mkdirSync(runDirectory);
  writeFileSync(join(runDirectory, "page-1.png"), "page one");
  writeFileSync(join(runDirectory, "page-2.png"), "page two");
  writeFileSync(join(runDirectory, "manifest.json"), JSON.stringify({
    runId: RUN_ID,
    status: "completed",
    storyTitle: "Mist at the Meridian",
    pageCount: 2,
    completedAt: "2026-10-28T12:14:05.348Z",
    rendered: [
      { pageNumber: 2, path: join(runDirectory, "page-2.png") },
      { pageNumber: 1, path: join(runDirectory, "page-1.png") },
    ],
    input: {
      summary: "Game 1 is depicted faithfully with its recorded winner unchanged.",
      continuityGuide: "PRIVATE-CONTINUITY",
      seriesLabel: "Ashes Over the Green Meridian · Day 1 of 7",
      story: {
        title: "Mist at the Meridian",
        premise: "A fellowship crosses changing battlefields.",
        dramaticQuestion: "Can the fellowship endure?",
      },
      pages: [
        { pageNumber: 1, title: "At the Red Gate", storyBeat: "The fellowship gathers at dawn.", panels: [{ visual: "PRIVATE-PANEL" }] },
        { pageNumber: 2, title: "Silver Terrace", storyBeat: "The tide turns on the terrace." },
      ],
    },
    discordTarget: "PRIVATE-DISCORD",
    delivery: { raw: "PRIVATE-DELIVERY" },
  }));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = runPublicationCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

describe("comic publication projection", () => {
  it("exports completed pages in reading order with publication-safe fields", () => {
    const result = run("--root", root, "get", RUN_ID);
    expect(result.code).toBe(EXIT.ok);
    expect(result.json()).toMatchObject({
      projectionVersion: 1,
      source: { system: "commander-comic", recordId: RUN_ID, version: "2026-10-28T12:14:05.348Z" },
      occurredAt: "2026-10-28T12:14:05.348Z",
      fields: { title: "Mist at the Meridian", pageCount: 2 },
      media: [
        { id: "page-1", path: join(runDirectory, "page-1.png"), mimeType: "image/png", caption: "At the Red Gate · 1 of 2" },
        { id: "page-2", path: join(runDirectory, "page-2.png"), mimeType: "image/png", caption: "Silver Terrace · 2 of 2" },
      ],
    });
  });

  it("does not expose prompts, continuity, Discord receipts, or delivery internals", () => {
    const output = run("--root", root, "get", RUN_ID).stdout;
    for (const marker of ["PRIVATE-CONTINUITY", "PRIVATE-PANEL", "PRIVATE-DISCORD", "PRIVATE-DELIVERY"]) {
      expect(output).not.toContain(marker);
    }
  });

  it("rejects missing, incomplete, and escaping runs", () => {
    expect(run("--root", root, "get", "00000000-0000-4000-8000-000000000000").code).toBe(EXIT.notFound);
    const manifestPath = join(runDirectory, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.status = "failed";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(run("--root", root, "get", RUN_ID)).toMatchObject({ code: EXIT.failure, stderr: expect.stringContaining("not completed") });
    manifest.status = "completed";
    manifest.rendered[0].path = join(root, "outside.png");
    writeFileSync(join(root, "outside.png"), "outside");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(run("--root", root, "get", RUN_ID)).toMatchObject({ code: EXIT.failure, stderr: expect.stringContaining("escapes") });
  });
});
