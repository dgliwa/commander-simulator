import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { selectComicBackground, selectComicStyle } from "./comic-types.js";
import { writeManifest } from "./comic-renderer.js";
import { type SeasonCoverInput, validateSeasonCoverInput } from "./season-cover-types.js";

export interface SeasonCoverWorkerRequest {
  comicRoot: string;
  discordTarget: string;
  openclawCommand: string;
  input: SeasonCoverInput;
}

export type SeasonCoverWorkerLauncher = (requestPath: string, logPath: string) => number;

export class SeasonCoverPublisher {
  constructor(
    private readonly comicRoot: string,
    private readonly discordTarget: string,
    private readonly openclawCommand = "openclaw",
    private readonly launchWorker: SeasonCoverWorkerLauncher = launchDetachedWorker,
  ) {}

  enqueue(input: SeasonCoverInput, signal?: AbortSignal): Record<string, unknown> {
    validateSeasonCoverInput(input);
    validateDiscordTarget(this.discordTarget);
    signal?.throwIfAborted();
    const directory = resolve(this.comicRoot, "seasons", input.seasonId, "cover");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const manifestPath = join(directory, "manifest.json");
    const current = readJson(manifestPath);
    if (current?.status === "queued" || current?.status === "running" || current?.status === "completed") {
      return statusResponse(manifestPath, current, false);
    }
    const requestPath = join(directory, "request.json");
    const logPath = join(directory, "publisher.log");
    const request: SeasonCoverWorkerRequest = {
      comicRoot: this.comicRoot,
      discordTarget: this.discordTarget,
      openclawCommand: this.openclawCommand,
      input,
    };
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    const queuedAt = new Date().toISOString();
    const queued = {
      status: "queued",
      seasonId: input.seasonId,
      seasonTitle: input.seasonTitle,
      style: selectComicStyle(input.artDirectionSeed),
      background: selectComicBackground(input.artDirectionSeed),
      queuedAt,
      input,
    };
    writeManifest(manifestPath, queued);
    try {
      const workerPid = this.launchWorker(requestPath, logPath);
      const launched = { ...queued, workerPid };
      writeManifest(manifestPath, launched);
      return statusResponse(manifestPath, launched, true);
    } catch (error) {
      const failed = {
        ...queued,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      writeManifest(manifestPath, failed);
      throw error;
    }
  }

  status(seasonId: string): Record<string, unknown> {
    if (!/^[0-9a-f-]{36}$/i.test(seasonId)) throw new Error("seasonId must be a UUID.");
    const manifestPath = join(resolve(this.comicRoot, "seasons", seasonId, "cover"), "manifest.json");
    const manifest = readJson(manifestPath);
    return manifest ? statusResponse(manifestPath, manifest, false) : { accepted: false, seasonId, status: "not_queued", manifestPath };
  }
}

export function readSeasonCoverWorkerRequest(path: string): SeasonCoverWorkerRequest {
  const request = JSON.parse(readFileSync(path, "utf8")) as SeasonCoverWorkerRequest;
  validateSeasonCoverInput(request.input);
  validateDiscordTarget(request.discordTarget);
  return request;
}

function launchDetachedWorker(requestPath: string, logPath: string): number {
  const workerPath = fileURLToPath(new URL("./season-cover-worker.js", import.meta.url));
  const logFd = openSync(logPath, "a", 0o600);
  try {
    const child = spawn(process.execPath, [workerPath, requestPath], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
      windowsHide: true,
    });
    child.unref();
    if (!child.pid) throw new Error("Season cover worker did not return a process ID.");
    return child.pid;
  } finally {
    closeSync(logFd);
  }
}

function validateDiscordTarget(target: string): void {
  if (!/^channel:\d{10,30}$/.test(target)) throw new Error("comicDiscordTarget must be configured as channel:<Discord channel ID>.");
}

function readJson(path: string): Record<string, any> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function statusResponse(manifestPath: string, manifest: Record<string, any>, accepted: boolean): Record<string, unknown> {
  return {
    accepted,
    seasonId: manifest.seasonId,
    status: manifest.status ?? "unknown",
    seasonTitle: manifest.seasonTitle ?? manifest.input?.seasonTitle,
    style: manifest.style,
    background: manifest.background,
    workerPid: manifest.workerPid,
    path: manifest.path,
    reused: manifest.reused,
    queuedAt: manifest.queuedAt,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    error: manifest.error,
    delivery: manifest.delivery,
    manifestPath,
  };
}
