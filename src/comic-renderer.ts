import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { composePagePrompt, type ComicPublishInput, validateComicInput } from "./comic-types.js";

const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type { ComicPublishInput } from "./comic-types.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal },
) => Promise<CommandResult>;

interface RenderedPage {
  pageNumber: number;
  path: string;
  reused: boolean;
}

interface FailedPage {
  pageNumber: number;
  error: string;
}

export class ComicRenderer {
  constructor(
    private readonly comicRoot: string,
    private readonly discordTarget: string,
    private readonly openclawCommand = "openclaw",
    private readonly runCommand: CommandRunner = executeCommand,
  ) {}

  async publish(input: ComicPublishInput): Promise<Record<string, unknown>> {
    validateComicInput(input);
    validateDiscordTarget(this.discordTarget);
    const runDirectory = resolve(this.comicRoot, input.runId);
    mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    chmodSync(runDirectory, 0o700);
    const manifestPath = join(runDirectory, "manifest.json");
    const startedAt = new Date().toISOString();
    const rendered: RenderedPage[] = [];
    const failed: FailedPage[] = [];
    writeManifest(manifestPath, { status: "running", startedAt, input, rendered, failed });

    for (const page of [...input.pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
      const outputPath = join(runDirectory, `page-${page.pageNumber}.png`);
      if (isExpectedPng(outputPath)) {
        rendered.push({ pageNumber: page.pageNumber, path: outputPath, reused: true });
        writeManifest(manifestPath, { status: "running", startedAt, input, rendered, failed });
        continue;
      }
      rmSync(outputPath, { force: true });
      try {
        await this.runCommand(this.openclawCommand, [
          "infer", "image", "generate",
          "--agent", "conductor",
          "--model", "openai/gpt-image-2",
          "--prompt", composePagePrompt(input, page),
          "--size", "1024x1536",
          "--quality", "high",
          "--output-format", "png",
          "--count", "1",
          "--timeout-ms", "600000",
          "--output", outputPath,
          "--json",
        ], { timeoutMs: 620_000 });
        if (!isExpectedPng(outputPath)) throw new Error("Image command completed without a valid 1024x1536 PNG.");
        chmodSync(outputPath, 0o600);
        rendered.push({ pageNumber: page.pageNumber, path: outputPath, reused: false });
      } catch (error) {
        rmSync(outputPath, { force: true });
        failed.push({ pageNumber: page.pageNumber, error: errorMessage(error) });
      }
      writeManifest(manifestPath, { status: "running", startedAt, input, rendered, failed });
    }

    const deliveryMessage = failed.length === 0
      ? input.summary
      : `${input.summary}\n\nComic page${failed.length === 1 ? "" : "s"} ${failed.map(item => item.pageNumber).join(", ")} failed to render and can be resumed later.`;
    const deliveryArgs = [
      "message", "send",
      "--channel", "discord",
      "--target", this.discordTarget,
      "--message", deliveryMessage,
      "--json",
    ];
    for (const page of [...rendered].sort((left, right) => left.pageNumber - right.pageNumber)) {
      deliveryArgs.push("--media", page.path);
    }
    const delivery = await this.runCommand(this.openclawCommand, deliveryArgs, { timeoutMs: 600_000 });
    const result = {
      runId: input.runId,
      status: failed.length === 0 ? "completed" : "partial",
      discordTarget: this.discordTarget,
      rendered,
      failed,
      delivery: parseJson(delivery.stdout),
      manifestPath,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    writeManifest(manifestPath, { ...result, input });
    return result;
  }
}

export async function executeCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    timeout: options.timeoutMs,
    signal: options.signal,
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
    windowsHide: true,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export function writeManifest(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function validateDiscordTarget(target: string): void {
  if (!/^channel:\d{10,30}$/.test(target)) {
    throw new Error("comicDiscordTarget must be configured as channel:<Discord channel ID>.");
  }
}

function isExpectedPng(path: string): boolean {
  if (!existsSync(path)) return false;
  const header = readFileSync(path).subarray(0, 24);
  return header.length === 24
    && header.subarray(0, 8).equals(PNG_SIGNATURE)
    && header.readUInt32BE(16) === 1024
    && header.readUInt32BE(20) === 1536;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error).replace(/\s+/g, " ").trim().slice(-1_000);
  const detail = [error.message, "stderr" in error ? String(error.stderr ?? "") : ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return detail.slice(-1_000) || "Unknown image-generation failure.";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value.trim().slice(-2_000);
  }
}
