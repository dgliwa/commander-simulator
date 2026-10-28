import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectComicBackground, selectComicStyle } from "./comic-types.js";
import { type CommandRunner, writeManifest } from "./comic-renderer.js";
import { composeSeasonCoverPrompt, type SeasonCoverInput, validateSeasonCoverInput } from "./season-cover-types.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class SeasonCoverRenderer {
  constructor(
    private readonly comicRoot: string,
    private readonly discordTarget: string,
    private readonly openclawCommand = "openclaw",
    private readonly runCommand: CommandRunner = executeCommand,
  ) {}

  async publish(input: SeasonCoverInput): Promise<Record<string, unknown>> {
    validateSeasonCoverInput(input);
    validateDiscordTarget(this.discordTarget);
    const directory = resolve(this.comicRoot, "seasons", input.seasonId, "cover");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const manifestPath = join(directory, "manifest.json");
    const outputPath = join(directory, "cover.png");
    const startedAt = new Date().toISOString();
    const style = selectComicStyle(input.artDirectionSeed);
    const background = selectComicBackground(input.artDirectionSeed);
    writeManifest(manifestPath, { status: "running", seasonId: input.seasonId, seasonTitle: input.seasonTitle, input, style, background, startedAt });

    let reused = isExpectedPng(outputPath);
    if (!reused) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await this.runCommand(this.openclawCommand, [
            "infer", "image", "generate",
            "--agent", "conductor",
            "--model", "openai/gpt-image-2",
            "--prompt", composeSeasonCoverPrompt(input),
            "--size", "1024x1536",
            "--quality", "high",
            "--output-format", "png",
            "--count", "1",
            "--timeout-ms", "600000",
            "--output", outputPath,
            "--json",
          ], { timeoutMs: 720_000 });
          if (!isExpectedPng(outputPath)) throw new Error("Image command completed without the expected 1024x1536 PNG.");
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      reused = false;
    }

    const heroes = input.characters.filter(character => character.role === "hero").map(character => character.commanderName);
    const rivals = input.characters.filter(character => character.role === "rival").map(character => character.commanderName);
    const message = `🎭 **${input.seasonTitle}**\n*A Seven-Day Commander Story*\n\nHeroes: ${heroes.join(" · ")}\nRivals: ${rivals.join(" · ")}\n\n${input.premise}`;
    const delivery = await this.runCommand(this.openclawCommand, [
      "message", "send",
      "--channel", "discord",
      "--target", this.discordTarget,
      "--message", message,
      "--media", outputPath,
      "--json",
    ], { timeoutMs: 600_000 });
    const result = {
      status: "completed",
      seasonId: input.seasonId,
      seasonTitle: input.seasonTitle,
      path: outputPath,
      reused,
      style,
      background,
      delivery: parseJson(delivery.stdout),
      manifestPath,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    writeManifest(manifestPath, { ...result, input });
    return result;
  }

  async reportFailure(input: SeasonCoverInput, error: unknown): Promise<Record<string, unknown>> {
    const delivery = await this.runCommand(this.openclawCommand, [
      "message", "send",
      "--channel", "discord",
      "--target", this.discordTarget,
      "--message", `⚠️ Season cover failed\n\n**${input.seasonTitle}**\n${errorMessage(error)}\n\nThe same season can safely retry without duplicating a completed cover.`,
      "--json",
    ], { timeoutMs: 120_000 });
    return parseJson(delivery.stdout);
  }
}

async function executeCommand(command: string, args: string[], options: { timeoutMs: number; signal?: AbortSignal }) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return promisify(execFile)(command, args, { timeout: options.timeoutMs, signal: options.signal, maxBuffer: 2 * 1024 * 1024 });
}

function validateDiscordTarget(target: string): void {
  if (!/^channel:\d{10,30}$/.test(target)) throw new Error("comicDiscordTarget must be configured as channel:<Discord channel ID>.");
}

function isExpectedPng(path: string): boolean {
  if (!existsSync(path)) return false;
  const header = readFileSync(path).subarray(0, 24);
  return header.length === 24
    && header.subarray(0, 8).equals(PNG_SIGNATURE)
    && header.readUInt32BE(16) === 1024
    && header.readUInt32BE(20) === 1536;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value.trim().slice(-2_000) };
  }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(-1_000);
}
