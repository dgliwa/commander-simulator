import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { forgeCardName } from "./magic-source.js";
export function writeForgeDeck(directory, deck) {
    const commanders = deck.cards.filter(card => card.board === "commanders");
    const mainboard = deck.cards.filter(card => card.board === "mainboard");
    const line = (card) => `${card.quantity} ${forgeCardName(card.name)}`;
    const content = [
        "[metadata]",
        `Name=${deck.name.replace(/[\r\n=]/g, " ")}`,
        `MoxfieldPublicId=${deck.publicId}`,
        "",
        "[Commander]",
        ...commanders.map(line),
        "[Main]",
        ...mainboard.map(line),
        "",
    ].join("\n");
    const path = join(directory, `${deck.publicId}.dck`);
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
    return path;
}
export async function runForge(paths, participants, games, seed, timeoutSeconds, logPath) {
    for (const participant of participants)
        writeForgeDeck(paths.deckDirectory, participant.deck);
    const args = [
        "-Xms512m",
        "-Xmx2g",
        "-jar",
        paths.forgeJar,
        "sim",
        "-D",
        paths.deckDirectory,
        "-d",
        ...participants.map(player => `${player.publicId}.dck`),
        "-f",
        "commander",
        "-n",
        String(games),
        "-s",
        String(seed),
        "-a",
        ...participants.map(player => player.persona),
        "-q",
        "-c",
        String(timeoutSeconds),
    ];
    const result = await execute(paths.java, args, paths.forgeDirectory, Math.min(30 * 60_000, games * timeoutSeconds * 1_000 + 180_000));
    writeFileSync(logPath, result.output, { encoding: "utf8", mode: 0o600 });
    chmodSync(logPath, 0o600);
    const parsed = parseForgeOutput(result.output, participants, games);
    return { games: parsed, output: result.output, error: result.error };
}
function execute(command, args, cwd, timeoutMs) {
    return new Promise(resolve => {
        const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        const chunks = [];
        let size = 0;
        let forcedError;
        const timer = setTimeout(() => {
            forcedError = "Forge process exceeded the overall simulation timeout.";
            child.kill("SIGKILL");
        }, timeoutMs);
        const collect = (chunk) => {
            size += chunk.length;
            if (size > 25 * 1024 * 1024) {
                forcedError = "Forge output exceeded 25 MB.";
                child.kill("SIGKILL");
            }
            else
                chunks.push(chunk);
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        child.on("error", error => {
            clearTimeout(timer);
            resolve({ output: Buffer.concat(chunks).toString("utf8"), error: error.message });
        });
        child.on("close", code => {
            clearTimeout(timer);
            const output = Buffer.concat(chunks).toString("utf8");
            resolve({ output, error: forcedError ?? (code === 0 ? undefined : `Forge exited with code ${code}.`) });
        });
    });
}
export function parseForgeOutput(output, participants, requestedGames) {
    const games = new Map();
    let pendingTurn;
    for (const line of output.split(/\r?\n/)) {
        const turn = line.match(/^Game Outcome: Turn (\d+)$/);
        if (turn)
            pendingTurn = Number(turn[1]);
        const result = line.match(/^Game Result: Game (\d+) ended in (\d+) ms\. Ai\((\d+)\)-.+ has won!$/);
        if (result) {
            const gameNumber = Number(result[1]);
            const winner = participants[Number(result[3]) - 1];
            games.set(gameNumber, { gameNumber, winnerPublicId: winner?.publicId, turns: pendingTurn, durationMs: Number(result[2]), status: winner ? "completed" : "failed" });
            pendingTurn = undefined;
        }
    }
    for (let gameNumber = 1; gameNumber <= requestedGames; gameNumber++) {
        if (!games.has(gameNumber))
            games.set(gameNumber, { gameNumber, status: output.includes("Stopping slow match as draw") ? "draw" : "failed" });
    }
    return [...games.values()].sort((a, b) => a.gameNumber - b.gameNumber);
}
