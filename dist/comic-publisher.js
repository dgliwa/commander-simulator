import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { validateComicInput } from "./comic-types.js";
import { writeManifest } from "./comic-renderer.js";
export class ComicPublisher {
    comicRoot;
    discordTarget;
    openclawCommand;
    launchWorker;
    constructor(comicRoot, discordTarget, openclawCommand = "openclaw", launchWorker = launchDetachedWorker) {
        this.comicRoot = comicRoot;
        this.discordTarget = discordTarget;
        this.openclawCommand = openclawCommand;
        this.launchWorker = launchWorker;
    }
    enqueue(input, signal) {
        validateComicInput(input);
        validateDiscordTarget(this.discordTarget);
        signal?.throwIfAborted();
        const runDirectory = resolve(this.comicRoot, input.runId);
        mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
        const manifestPath = join(runDirectory, "manifest.json");
        const current = readJson(manifestPath);
        if (current?.status === "queued" || current?.status === "running") {
            return statusResponse(manifestPath, current, false);
        }
        if (current?.status === "completed") {
            return statusResponse(manifestPath, current, false);
        }
        const requestPath = join(runDirectory, "request.json");
        const logPath = join(runDirectory, "publisher.log");
        const request = {
            comicRoot: this.comicRoot,
            discordTarget: this.discordTarget,
            openclawCommand: this.openclawCommand,
            input,
        };
        writeOwnerOnly(requestPath, request);
        const queuedAt = new Date().toISOString();
        writeManifest(manifestPath, {
            status: "queued",
            queuedAt,
            runId: input.runId,
            storyTitle: input.story.title,
            pageCount: input.pages.length,
            rendered: [],
            failed: [],
        });
        const pid = this.launchWorker(requestPath, logPath);
        writeManifest(manifestPath, {
            status: "queued",
            queuedAt,
            runId: input.runId,
            storyTitle: input.story.title,
            pageCount: input.pages.length,
            workerPid: pid,
            rendered: [],
            failed: [],
        });
        return {
            accepted: true,
            status: "queued",
            runId: input.runId,
            storyTitle: input.story.title,
            pageCount: input.pages.length,
            workerPid: pid,
            manifestPath,
            message: "Comic publication is running independently. Do not poll or regenerate pages; completion or partial results will be delivered directly to the configured Discord channel.",
        };
    }
    status(runId) {
        if (!/^[0-9a-f-]{36}$/i.test(runId))
            throw new Error("runId must be a simulator UUID.");
        const manifestPath = join(resolve(this.comicRoot, runId), "manifest.json");
        const manifest = readJson(manifestPath);
        if (!manifest)
            return { runId, status: "not_started", manifestPath };
        return statusResponse(manifestPath, manifest, false);
    }
}
export function readWorkerRequest(path) {
    const request = readJson(path);
    if (!request)
        throw new Error("Comic worker request is missing or invalid.");
    validateComicInput(request.input);
    validateDiscordTarget(request.discordTarget);
    return request;
}
function launchDetachedWorker(requestPath, logPath) {
    const workerPath = fileURLToPath(new URL("./comic-worker.js", import.meta.url));
    const logFd = openSync(logPath, "a", 0o600);
    try {
        const child = spawn(process.execPath, [workerPath, requestPath], {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            env: process.env,
            windowsHide: true,
        });
        child.unref();
        if (!child.pid)
            throw new Error("Comic publisher worker did not return a process ID.");
        return child.pid;
    }
    finally {
        closeSync(logFd);
    }
}
function validateDiscordTarget(target) {
    if (!/^channel:\d{10,30}$/.test(target)) {
        throw new Error("comicDiscordTarget must be configured as channel:<Discord channel ID>.");
    }
}
function writeOwnerOnly(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
function readJson(path) {
    if (!existsSync(path))
        return undefined;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return undefined;
    }
}
function statusResponse(manifestPath, manifest, accepted) {
    return {
        accepted,
        runId: manifest.runId,
        status: manifest.status ?? "unknown",
        storyTitle: manifest.storyTitle ?? manifest.input?.story?.title,
        pageCount: manifest.pageCount ?? manifest.input?.pages?.length,
        workerPid: manifest.workerPid,
        rendered: manifest.rendered ?? [],
        failed: manifest.failed ?? [],
        queuedAt: manifest.queuedAt,
        startedAt: manifest.startedAt,
        completedAt: manifest.completedAt,
        error: manifest.error,
        delivery: manifest.delivery,
        manifestPath,
    };
}
