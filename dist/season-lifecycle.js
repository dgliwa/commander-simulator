import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ComicPublisher } from "./comic-publisher.js";
import { SimulatorDatabase } from "./database.js";
import { projectSeason } from "./season-publication.js";
function readManifest(path) {
    if (!existsSync(path))
        return undefined;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return undefined;
    }
}
function exportPath(comicRoot, seasonId) {
    return resolve(comicRoot, "seasons", seasonId, "season-export.json");
}
function writeOwnerOnlyJson(path, value) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    chmodSync(path, 0o600);
}
export function reconcileSeason(databasePath, magicDatabasePath, comicRoot, seasonId) {
    const database = new SimulatorDatabase(databasePath);
    try {
        let season = database.getSeason(seasonId);
        const episodes = database.getSeasonEpisodes(seasonId);
        for (const episode of episodes) {
            const manifest = readManifest(join(resolve(comicRoot, episode.runId), "manifest.json"));
            if (!manifest?.status)
                continue;
            let status;
            if (manifest.status === "completed")
                status = "published";
            else if (manifest.status === "queued" || manifest.status === "running")
                status = manifest.status;
            else if (manifest.status === "failed" || manifest.status === "partial")
                status = "failed";
            if (status && status !== episode.status) {
                database.updateEpisodeStatus(seasonId, episode.dayNumber, status, status === "published" ? manifest.completedAt ?? new Date().toISOString() : undefined);
            }
        }
        const refreshed = database.getSeasonEpisodes(seasonId);
        const cover = readManifest(resolve(comicRoot, "seasons", seasonId, "cover", "manifest.json"));
        const allPublished = refreshed.length === 7 && refreshed.every(episode => episode.status === "published");
        if (allPublished && cover?.status === "completed" && season.status !== "completed") {
            season = database.updateSeasonStatus(seasonId, "completed");
        }
        const destination = exportPath(comicRoot, seasonId);
        if (season.status === "completed" && !existsSync(destination)) {
            writeOwnerOnlyJson(destination, projectSeason(seasonId, comicRoot, databasePath, magicDatabasePath));
        }
        return {
            seasonId,
            status: season.status,
            publishedEpisodes: refreshed.filter(episode => episode.status === "published").length,
            activeEpisodes: refreshed.filter(episode => episode.status === "queued" || episode.status === "running").length,
            ...(existsSync(destination) ? { exportPath: destination } : {}),
        };
    }
    finally {
        database.close();
    }
}
export function reconcileAllSeasons(databasePath, magicDatabasePath, comicRoot) {
    const database = new SimulatorDatabase(databasePath);
    let seasons;
    try {
        seasons = database.listSeasons(100);
    }
    finally {
        database.close();
    }
    return seasons.map(season => reconcileSeason(databasePath, magicDatabasePath, comicRoot, season.id));
}
export function oldestUnfinishedSeason(databasePath) {
    const database = new SimulatorDatabase(databasePath);
    try {
        return database.listSeasons(100)
            .filter(season => season.status !== "completed")
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    }
    finally {
        database.close();
    }
}
export function queueEpisodeOneAfterCover(context, comicRoot, discordTarget, openclawCommand) {
    reconcileSeason(context.databasePath, context.magicDatabasePath, comicRoot, context.seasonId);
    const database = new SimulatorDatabase(context.databasePath);
    try {
        const season = database.getSeason(context.seasonId);
        if (season.status === "completed")
            return { queued: false, reason: "Season is already completed." };
        const episodes = database.getSeasonEpisodes(context.seasonId);
        const active = episodes.find(episode => episode.status === "queued" || episode.status === "running");
        if (active)
            return { queued: false, reason: `Episode ${active.dayNumber} is already rendering.` };
        if (episodes.some(episode => episode.status === "published")) {
            return { queued: false, reason: "Season publication already started." };
        }
        const first = episodes.find(episode => episode.dayNumber === 1);
        if (!first || (first.status !== "planned" && first.status !== "failed")) {
            return { queued: false, reason: "Episode 1 is not queueable." };
        }
        const publisher = new ComicPublisher(comicRoot, discordTarget, openclawCommand);
        const publication = publisher.enqueue(first.comic, undefined, { ...context, dayNumber: 1 });
        const publicationStatus = String(publication.status ?? "queued");
        database.updateEpisodeStatus(context.seasonId, 1, publicationStatus === "running" ? "running" : "queued");
        database.updateSeasonStatus(context.seasonId, "publishing");
        return { queued: true, dayNumber: 1, publication };
    }
    finally {
        database.close();
    }
}
export function reconcileDeliveredEpisode(context, comicRoot) {
    return reconcileSeason(context.databasePath, context.magicDatabasePath, comicRoot, context.seasonId);
}
