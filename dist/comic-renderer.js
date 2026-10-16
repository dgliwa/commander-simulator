import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export class ComicRenderer {
    comicRoot;
    discordTarget;
    openclawCommand;
    runCommand;
    constructor(comicRoot, discordTarget, openclawCommand = "openclaw", runCommand = executeCommand) {
        this.comicRoot = comicRoot;
        this.discordTarget = discordTarget;
        this.openclawCommand = openclawCommand;
        this.runCommand = runCommand;
    }
    async publish(input, signal) {
        validateInput(input);
        validateDiscordTarget(this.discordTarget);
        signal?.throwIfAborted();
        const runDirectory = resolve(this.comicRoot, input.runId);
        mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
        chmodSync(runDirectory, 0o700);
        writeOwnerOnly(join(runDirectory, "manifest.json"), `${JSON.stringify({
            runId: input.runId,
            summary: input.summary,
            pages: input.pages,
            updatedAt: new Date().toISOString(),
        }, null, 2)}\n`);
        const rendered = [];
        const failed = [];
        for (const page of [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
            signal?.throwIfAborted();
            const outputPath = join(runDirectory, `page-${page.pageNumber}.png`);
            if (isExpectedPng(outputPath)) {
                rendered.push({ pageNumber: page.pageNumber, path: outputPath, reused: true });
                continue;
            }
            rmSync(outputPath, { force: true });
            try {
                await this.runCommand(this.openclawCommand, [
                    "infer", "image", "generate",
                    "--agent", "conductor",
                    "--model", "openai/gpt-image-2",
                    "--prompt", page.prompt,
                    "--size", "1024x1536",
                    "--quality", "high",
                    "--output-format", "png",
                    "--count", "1",
                    "--timeout-ms", "600000",
                    "--output", outputPath,
                    "--json",
                ], { timeoutMs: 620_000, signal });
                if (!isExpectedPng(outputPath))
                    throw new Error("Image command completed without a valid 1024x1536 PNG.");
                chmodSync(outputPath, 0o600);
                rendered.push({ pageNumber: page.pageNumber, path: outputPath, reused: false });
            }
            catch (error) {
                failed.push({ pageNumber: page.pageNumber, error: conciseError(error) });
            }
        }
        const deliveryText = failed.length === 0
            ? input.summary
            : `${input.summary}\n\nComic rendering incomplete: missing page${failed.length === 1 ? "" : "s"} ${failed.map(item => item.pageNumber).join(", ")}.`;
        const mediaArgs = rendered
            .sort((a, b) => a.pageNumber - b.pageNumber)
            .flatMap(page => ["--media", page.path]);
        const delivery = await this.runCommand(this.openclawCommand, [
            "message", "send",
            "--channel", "discord",
            "--target", this.discordTarget,
            "--message", deliveryText,
            ...mediaArgs,
            "--json",
        ], { timeoutMs: 180_000, signal });
        return {
            runId: input.runId,
            delivered: true,
            discordTarget: this.discordTarget,
            rendered,
            failed,
            delivery: parseJson(delivery.stdout),
            manifestPath: join(runDirectory, "manifest.json"),
        };
    }
}
async function executeCommand(command, args, options) {
    const result = await execFileAsync(command, args, {
        timeout: options.timeoutMs,
        signal: options.signal,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
        windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr };
}
function validateInput(input) {
    if (input.confirmed !== true)
        throw new Error("Comic rendering and Discord delivery require confirmed=true.");
    if (!/^[0-9a-f-]{36}$/i.test(input.runId))
        throw new Error("runId must be a simulator UUID.");
    const summary = input.summary.trim();
    if (!summary || summary.length > 8_000 || summary.includes("\0"))
        throw new Error("summary must contain 1-8000 safe characters.");
    if (input.pages.length < 3 || input.pages.length > 5)
        throw new Error("Comic publication requires 3-5 pages.");
    const seen = new Set();
    for (const page of input.pages) {
        if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 5)
            throw new Error("pageNumber must be an integer from 1 to 5.");
        if (seen.has(page.pageNumber))
            throw new Error(`Duplicate comic page number ${page.pageNumber}.`);
        seen.add(page.pageNumber);
        const prompt = page.prompt.trim();
        if (!prompt || prompt.length > 30_000 || prompt.includes("\0"))
            throw new Error(`Page ${page.pageNumber} prompt must contain 1-30000 safe characters.`);
    }
}
function validateDiscordTarget(target) {
    if (!/^channel:\d{10,30}$/.test(target))
        throw new Error("comicDiscordTarget must be configured as channel:<Discord channel ID>.");
}
function isExpectedPng(path) {
    if (!existsSync(path))
        return false;
    try {
        const header = readFileSync(path).subarray(0, 24);
        return header.length >= 24
            && header.subarray(0, 8).equals(PNG_SIGNATURE)
            && header.readUInt32BE(16) === 1024
            && header.readUInt32BE(20) === 1536;
    }
    catch {
        return false;
    }
}
function writeOwnerOnly(path, content) {
    writeFileSync(path, content, { mode: 0o600 });
    chmodSync(path, 0o600);
}
function conciseError(error) {
    const value = error instanceof Error ? error.message : String(error);
    return value.replace(/\s+/g, " ").trim().slice(-1_000) || "Unknown image-generation error.";
}
function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return { raw: value.trim().slice(-2_000) };
    }
}
