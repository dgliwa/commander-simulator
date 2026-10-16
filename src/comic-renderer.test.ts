import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ComicRenderer, type CommandRunner, type ComicPublishInput } from "./comic-renderer.js";

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
    pages: [1, 2, 3].map(pageNumber => ({ pageNumber, prompt: `Page ${pageNumber} prompt` })),
  };
}

describe("ComicRenderer", () => {
  test("renders sequential pages, saves a manifest, and sends one Discord message", async () => {
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
    expect(JSON.parse(readFileSync(join(root, input().runId, "manifest.json"), "utf8")).summary).toBe("Game summary");
    expect(statSync(join(root, input().runId, "manifest.json")).mode & 0o777).toBe(0o600);
  });

  test("reuses existing validated pages without spending another image request", async () => {
    const { calls, renderer } = fixture();
    await renderer.publish(input());
    calls.length = 0;

    const result = await renderer.publish(input());

    expect(result.rendered.every(page => page.reused)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(["message", "send"]);
  });

  test("continues after one page fails and reports the missing page", async () => {
    const { calls, renderer } = fixture(2);
    const result = await renderer.publish(input());

    expect(result.rendered.map(page => page.pageNumber)).toEqual([1, 3]);
    expect(result.failed).toEqual([{ pageNumber: 2, error: "provider failed" }]);
    const send = calls.at(-1)!;
    expect(send[send.indexOf("--message") + 1]).toContain("missing page 2");
    expect(send.filter(value => value === "--media")).toHaveLength(2);
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
