import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ComicPublisher } from "./comic-publisher.js";
import { normalizeComicInput, validateComicInput } from "./comic-types.js";
import { runForge } from "./forge.js";
import { FORGE_PERSONAS } from "./types.js";
export class CommanderSimulatorService {
    database;
    magic;
    paths;
    options;
    constructor(database, magic, paths, options = {}) {
        this.database = database;
        this.magic = magic;
        this.paths = paths;
        this.options = options;
    }
    personas() {
        return {
            personas: [
                { name: "Default", description: "Forge's balanced baseline AI profile." },
                { name: "Cautious", description: "More conservative combat and resource decisions." },
                { name: "Reckless", description: "More aggressive attacks and willingness to trade." },
                { name: "Experimental", description: "Forge's experimental AI behavior profile." },
            ],
            note: "Forge personas adjust heuristic settings; they are not language-model roleplay personas.",
        };
    }
    builtDecks() {
        return { decks: this.magic.listBuilt() };
    }
    createPod(input) {
        const participants = validateParticipants(input.participants);
        for (const player of participants)
            this.assertBuilt(player.publicId);
        return this.database.createPod(cleanName(input.name), participants);
    }
    updatePod(id, input) {
        const participants = input.participants ? validateParticipants(input.participants) : undefined;
        if (participants)
            for (const player of participants)
                this.assertBuilt(player.publicId);
        return this.database.updatePod(id, { name: input.name === undefined ? undefined : cleanName(input.name), participants });
    }
    deletePod(id) {
        return this.database.deletePod(id);
    }
    listPods() {
        return { pods: this.database.listPods() };
    }
    getPod(id) {
        return this.database.getPod(id);
    }
    compatibility(publicId) {
        return this.magic.compatibility(publicId);
    }
    async simulate(input) {
        if (!input.confirmed)
            throw new Error("Simulation requires confirmed=true because it starts a bounded Forge process and writes durable results.");
        const pod = this.database.getPod(input.podId);
        const games = integer(input.games ?? 1, 1, 10, "games");
        const timeoutSeconds = integer(input.timeoutSeconds ?? 120, 10, 300, "timeoutSeconds");
        const seed = input.seed === undefined ? randomInt(1, 2_147_483_647) : integer(input.seed, 0, 2_147_483_647, "seed");
        const participants = pod.participants.map(participant => ({ ...participant, ...this.assertBuilt(participant.publicId) })).map(item => ({
            publicId: item.publicId,
            persona: item.persona,
            seat: item.seat,
            name: item.name,
            commanderNames: item.cards
                .filter(card => card.board === "commanders")
                .flatMap(card => Array.from({ length: card.quantity }, () => card.name)),
            deck: {
                publicId: item.publicId,
                name: item.name,
                format: item.format,
                visibility: item.visibility,
                publicUrl: item.publicUrl,
                archivedAt: item.archivedAt,
                snapshotRefreshedAt: item.snapshotRefreshedAt,
                tags: item.tags,
                cards: item.cards,
            },
        }));
        for (const participant of participants) {
            const report = this.magic.compatibility(participant.publicId);
            if (report.warnings.some(warning => warning.includes("archived") || warning.includes("no cached")))
                throw new Error(`${participant.name} is not simulation-ready: ${report.warnings.join(" ")}`);
        }
        const id = randomUUID();
        const logPath = join(this.paths.logDirectory, `${id}.log`);
        this.database.startRun({
            id,
            podId: pod.id,
            requestedGames: games,
            seed,
            timeoutSeconds,
            participants: participants.map(({ publicId, persona, seat, name, commanderNames }) => ({
                publicId,
                persona,
                seat,
                name,
                commanderNames,
            })),
            logPath,
        });
        try {
            const result = await runForge(this.paths, participants, games, seed, timeoutSeconds, logPath);
            const parseError = result.games.some(game => game.status === "failed") ? "Forge did not produce a complete result for every requested game. Inspect the owner-only log." : undefined;
            return this.database.finishRun(id, result.games, result.error ?? parseError);
        }
        catch (error) {
            return this.database.finishRun(id, [], error instanceof Error ? error.message : String(error));
        }
    }
    listRuns(limit = 25) {
        return { runs: this.database.listRuns(integer(limit, 1, 100, "limit")) };
    }
    getRun(id) {
        return this.database.getRun(id);
    }
    runLog(id, offset = 0, limit = 300) {
        const run = this.database.getRun(id);
        const logRoot = resolve(this.paths.logDirectory);
        const logPath = resolve(run.logPath);
        const rel = relative(logRoot, logPath);
        if (rel.startsWith("..") || isAbsolute(rel))
            throw new Error("Simulation log path is outside the managed log directory.");
        const lines = readFileSync(logPath, "utf8").split(/\r?\n/);
        const prefixes = [
            "Simulation mode", "Ai(", "Mulligan:", "Turn:", "Land:", "Add Stack:", "Add To Stack:",
            "Resolve Stack:", "Combat:", "Damage:", "Life:", "Zone Change:", "Player Control:",
            "Game Outcome:", "Match Result:", "Game Result:",
        ];
        const events = lines.filter(line => prefixes.some(prefix => line.startsWith(prefix)));
        const safeOffset = integer(offset, 0, Math.max(events.length, 0), "offset");
        const safeLimit = integer(limit, 1, 500, "limit");
        return {
            runId: id,
            participants: run.participants.map(participant => ({
                deckName: participant.name,
                commanderNames: participant.commanderNames ?? this.magic.get(participant.publicId).cards
                    .filter(card => card.board === "commanders")
                    .flatMap(card => Array.from({ length: card.quantity }, () => card.name)),
                persona: participant.persona,
                seat: participant.seat,
            })),
            totalEvents: events.length,
            offset: safeOffset,
            limit: safeLimit,
            hasMore: safeOffset + safeLimit < events.length,
            events: events.slice(safeOffset, safeOffset + safeLimit),
        };
    }
    standings() {
        const deckPersonas = this.database.standings().deckPersonas;
        return {
            deckPersonas,
            decks: aggregateStandings(deckPersonas, entry => `${entry.publicId}\u0000${entry.deckName}`, ([publicId, deckName]) => ({ publicId, deckName })),
            personas: aggregateStandings(deckPersonas, entry => entry.persona, ([persona]) => ({ persona })),
        };
    }
    createSeason(input) {
        const heroes = uniqueIds(input.heroPublicIds, 2, "heroPublicIds");
        const opponents = uniqueIds(input.opponentPublicIds, 4, "opponentPublicIds");
        if (heroes.some(id => opponents.includes(id)))
            throw new Error("Heroes and generated opponents must be distinct decks.");
        for (const publicId of heroes) {
            const deck = this.assertBuilt(publicId);
            if (deck.tags.includes("generated") || deck.tags.includes("not-owned"))
                throw new Error(`${deck.name} is generated/not-owned and cannot be selected as a hero.`);
        }
        for (const publicId of opponents) {
            const deck = this.assertBuilt(publicId);
            if (!deck.tags.includes("generated") || !deck.tags.includes("not-owned"))
                throw new Error(`${deck.name} must be tagged generated and not-owned to serve as a season opponent.`);
        }
        const seasonKey = input.seasonKey.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(seasonKey))
            throw new Error("seasonKey must use 1-100 lowercase letters, numbers, underscores, or hyphens.");
        const season = this.database.createSeason({ seasonKey, title: cleanName(input.title), heroPublicIds: heroes, opponentPublicIds: opponents });
        return this.seasonDetails(season.id);
    }
    async simulateNextSeasonGame(input) {
        const season = this.database.getSeason(input.seasonId);
        const priorGames = this.database.getSeasonGames(season.id);
        if (priorGames.length >= 7)
            throw new Error("All seven season games are already stored.");
        const gameNumber = priorGames.length + 1;
        const opponentPair = gameNumber <= 6
            ? opponentPairForGame(season.opponentPublicIds, gameNumber)
            : this.finaleOpponents(season.opponentPublicIds, priorGames);
        const ids = [...season.heroPublicIds, ...opponentPair];
        const participants = ids.map((publicId, index) => ({
            publicId,
            persona: FORGE_PERSONAS[(index + gameNumber - 1) % FORGE_PERSONAS.length],
        }));
        const label = gameNumber === 7 ? "Finale" : `Round ${gameNumber}`;
        const pod = this.createPod({ name: `${season.title} · ${label}`, participants });
        this.database.updateSeasonStatus(season.id, "simulating");
        const run = await this.simulate({
            podId: pod.id,
            games: 1,
            seed: input.seed === undefined ? seasonSeed(season.styleSeed, gameNumber) : input.seed,
            timeoutSeconds: input.timeoutSeconds ?? 300,
            confirmed: true,
        });
        if (!run.games.some(game => game.status === "completed" || game.status === "draw")) {
            return { stored: false, seasonId: season.id, gameNumber, label, run, retry: "Call commander_season_simulate_next again; failed runs are preserved but do not advance the season." };
        }
        this.database.addSeasonGame({ seasonId: season.id, gameNumber, label, podId: pod.id, runId: run.id, participantPublicIds: ids });
        if (gameNumber === 7)
            this.database.updateSeasonStatus(season.id, "awaiting_plan");
        return { stored: true, ...this.seasonDetails(season.id), latestRun: run };
    }
    planSeason(input) {
        const season = this.database.getSeason(input.seasonId);
        const games = this.database.getSeasonGames(season.id);
        if (games.length !== 7)
            throw new Error("All seven season games must be completed before planning episodes.");
        if (input.episodes.length !== 7 || new Set(input.episodes.map(episode => episode.dayNumber)).size !== 7) {
            throw new Error("A season plan requires exactly one episode for each day 1 through 7.");
        }
        const planned = [...input.episodes].sort((left, right) => left.dayNumber - right.dayNumber).map((episode, index) => {
            if (episode.dayNumber !== index + 1)
                throw new Error("Episode dayNumber values must cover 1 through 7.");
            const game = games[index];
            const comic = normalizeComicInput({
                confirmed: true,
                runId: game.runId,
                summary: episode.summary,
                continuityGuide: episode.continuityGuide,
                artDirectionSeed: season.styleSeed,
                seriesLabel: `${season.title} · Day ${episode.dayNumber} of 7`,
                story: episode.story,
                pages: episode.pages,
            });
            validateComicInput(comic);
            return { dayNumber: episode.dayNumber, runId: game.runId, comic };
        });
        this.database.saveSeasonPlan(season.id, planned);
        return this.seasonDetails(season.id);
    }
    publishNextSeasonEpisode(input) {
        const season = this.database.getSeason(input.seasonId);
        const publisher = new ComicPublisher(this.paths.comicDirectory, this.options.comicDiscordTarget ?? "", this.options.openclawCommand);
        const episodes = this.database.getSeasonEpisodes(season.id);
        if (episodes.length !== 7)
            throw new Error("The season does not yet have seven planned episodes.");
        for (const episode of episodes) {
            const status = publisher.status(episode.runId);
            if (status.status === "completed" && episode.status !== "published") {
                this.database.updateEpisodeStatus(season.id, episode.dayNumber, "published", String(status.completedAt ?? new Date().toISOString()));
            }
            else if ((status.status === "queued" || status.status === "running") && episode.status !== status.status) {
                this.database.updateEpisodeStatus(season.id, episode.dayNumber, status.status);
            }
            else if ((status.status === "failed" || status.status === "partial") && episode.status !== "failed") {
                this.database.updateEpisodeStatus(season.id, episode.dayNumber, "failed");
            }
        }
        const refreshed = this.database.getSeasonEpisodes(season.id);
        const active = refreshed.find(episode => episode.status === "queued" || episode.status === "running");
        if (active)
            return { queued: false, reason: "An episode is already rendering.", ...this.seasonDetails(season.id) };
        const next = refreshed.find(episode => episode.status === "planned" || episode.status === "failed");
        if (!next) {
            this.database.updateSeasonStatus(season.id, "completed");
            return { queued: false, reason: "All seven episodes are published.", ...this.seasonDetails(season.id) };
        }
        this.database.updateSeasonStatus(season.id, "publishing");
        const publication = publisher.enqueue(next.comic);
        this.database.updateEpisodeStatus(season.id, next.dayNumber, "queued");
        return { queued: true, dayNumber: next.dayNumber, publication, ...this.seasonDetails(season.id) };
    }
    seasonStatus(seasonId) {
        return seasonId ? this.seasonDetails(seasonId) : { seasons: this.database.listSeasons().map(season => this.seasonDetails(season.id)) };
    }
    async dailyGame(input) {
        const seed = input.seed === undefined ? dailySeed() : integer(input.seed, 0, 2_147_483_647, "seed");
        const decks = this.magic.listBuilt();
        if (decks.length < 4)
            throw new Error("At least four active built decks are required for the daily Commander game.");
        const selected = shuffle(decks, seed).slice(0, 4);
        const personas = shuffle([...FORGE_PERSONAS], seed ^ 0x5f3759df);
        const participants = selected.map((deck, index) => ({ publicId: deck.publicId, persona: personas[index] }));
        const name = "Daily Commander Game";
        const existing = this.database.listPods().find(pod => pod.name === name);
        const pod = existing
            ? this.updatePod(existing.id, { participants })
            : this.createPod({ name, participants });
        return this.simulate({ podId: pod.id, games: 1, seed, timeoutSeconds: input.timeoutSeconds ?? 180, confirmed: true });
    }
    publishComic(input, signal) {
        const run = this.database.getRun(input.runId);
        if (run.status !== "completed")
            throw new Error("Comic publication requires a completed simulation run.");
        const publisher = new ComicPublisher(this.paths.comicDirectory, this.options.comicDiscordTarget ?? "", this.options.openclawCommand);
        return publisher.enqueue(input, signal);
    }
    comicStatus(runId) {
        const publisher = new ComicPublisher(this.paths.comicDirectory, this.options.comicDiscordTarget ?? "", this.options.openclawCommand);
        return publisher.status(runId);
    }
    status() {
        return {
            ...this.database.summary(),
            builtDecks: this.magic.listBuilt().length,
            forge: { java: this.paths.java, jar: this.paths.forgeJar, deckDirectory: this.paths.deckDirectory },
            limits: { players: "2-8", gamesPerInvocation: "1-10", perGameTimeoutSeconds: "10-300" },
        };
    }
    seasonDetails(seasonId) {
        const season = this.database.getSeason(seasonId);
        const games = this.database.getSeasonGames(seasonId).map(game => ({ ...game, run: this.database.getRun(game.runId) }));
        const episodes = this.database.getSeasonEpisodes(seasonId).map(({ comic: _comic, ...episode }) => episode);
        return {
            season,
            cast: {
                heroes: season.heroPublicIds.map(publicId => this.magic.get(publicId)).map(deck => ({ publicId: deck.publicId, name: deck.name, commanders: commanderNames(deck), tags: deck.tags })),
                opponents: season.opponentPublicIds.map(publicId => this.magic.get(publicId)).map(deck => ({ publicId: deck.publicId, name: deck.name, commanders: commanderNames(deck), tags: deck.tags })),
            },
            games,
            episodes,
            nextAction: games.length < 7 ? "simulate_next" : episodes.length < 7 ? "plan" : episodes.some(episode => episode.status !== "published") ? "publish_next" : "complete",
        };
    }
    finaleOpponents(opponents, games) {
        const wins = new Map(opponents.map(id => [id, 0]));
        for (const game of games) {
            const run = this.database.getRun(game.runId);
            for (const [publicId, count] of Object.entries(run.winnerCounts)) {
                if (wins.has(publicId))
                    wins.set(publicId, (wins.get(publicId) ?? 0) + count);
            }
        }
        return [...opponents].sort((left, right) => (wins.get(right) ?? 0) - (wins.get(left) ?? 0) || opponents.indexOf(left) - opponents.indexOf(right)).slice(0, 2);
    }
    assertBuilt(publicId) {
        const deck = this.magic.get(publicId);
        if (!deck.tags.includes("built"))
            throw new Error(`${deck.name} is not tagged built in Magic Workspace.`);
        return deck;
    }
}
function aggregateStandings(entries, keyOf, identity) {
    const totals = new Map();
    for (const entry of entries) {
        const key = keyOf(entry);
        const current = totals.get(key) ?? { ...identity(key.split("\u0000")), games: 0, wins: 0, losses: 0, draws: 0 };
        current.games += entry.games;
        current.wins += entry.wins;
        current.losses += entry.losses;
        current.draws += entry.draws;
        totals.set(key, current);
    }
    return [...totals.values()].map(item => ({ ...item, winRate: item.games ? item.wins / item.games : 0 }))
        .sort((a, b) => b.wins - a.wins || b.games - a.games || String(a.deckName ?? a.persona).localeCompare(String(b.deckName ?? b.persona)));
}
function shuffle(items, seed) {
    const result = [...items];
    let state = seed >>> 0 || 0x9e3779b9;
    const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 0x1_0000_0000;
    };
    for (let index = result.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}
function dailySeed() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(`${value.year}${value.month}${value.day}`);
}
function opponentPairForGame(opponents, gameNumber) {
    const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    const pair = pairs[gameNumber - 1];
    if (!pair)
        throw new Error(`No round-robin pairing for game ${gameNumber}.`);
    return [opponents[pair[0]], opponents[pair[1]]];
}
function seasonSeed(styleSeed, gameNumber) {
    let hash = 2166136261;
    for (const character of `${styleSeed}:${gameNumber}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 2_147_483_647;
}
function uniqueIds(values, expected, label) {
    const ids = values.map(value => value.trim()).filter(Boolean);
    if (ids.length !== expected || new Set(ids).size !== expected)
        throw new Error(`${label} must contain exactly ${expected} distinct deck IDs.`);
    return ids;
}
function commanderNames(deck) {
    return deck.cards.filter(card => card.board === "commanders").flatMap(card => Array.from({ length: card.quantity }, () => card.name));
}
function cleanName(value) {
    const name = value.trim();
    if (!name)
        throw new Error("Pod name is required.");
    return name;
}
function validateParticipants(input) {
    if (input.length < 2 || input.length > 8)
        throw new Error("Commander pods require 2-8 participants.");
    const seen = new Set();
    return input.map((participant, index) => {
        const publicId = participant.publicId.trim();
        if (!publicId)
            throw new Error("Every participant needs a Magic Workspace publicId.");
        if (seen.has(publicId))
            throw new Error(`Deck ${publicId} appears more than once in the pod.`);
        seen.add(publicId);
        const persona = participant.persona ?? "Default";
        if (!FORGE_PERSONAS.includes(persona))
            throw new Error(`Unsupported Forge persona: ${persona}`);
        return { publicId, persona, seat: index + 1 };
    });
}
function integer(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    return value;
}
