import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { MagicDeckSource } from "./magic-source.js";
import { pathInside } from "./publication.js";

export interface SeasonCommanderProjection {
  name: string;
  deckName: string;
  deckPublicId: string;
  role: "hero" | "rival";
  scryfallUrl: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface SeasonMatchProjection {
  number: number;
  title: string;
  summary: string;
  winnerNames: string[];
  turns?: number;
  keyMoments: string[];
}

export interface SeasonProjection {
  projectionVersion: 1;
  source: { system: "commander-season"; recordId: string; version: string };
  occurredAt: string;
  fields: {
    title: string;
    summary: string;
    premise?: string;
    dramaticQuestion?: string;
    matchCount: number;
    pageCount: number;
    commanders: SeasonCommanderProjection[];
    matches: SeasonMatchProjection[];
  };
  optInFields: Record<string, never>;
  media: Array<{
    id: string;
    path: string;
    mimeType: "image/png";
    caption: string;
    altHint: string;
  }>;
}

type Row = Record<string, unknown>;
type ComicInput = {
  summary?: string;
  story?: { title?: string; premise?: string; dramaticQuestion?: string };
  pages?: Array<{
    pageNumber?: number;
    title?: string;
    storyBeat?: string;
    panels?: Array<{ gameplayCue?: string }>;
  }>;
};
type ComicManifest = {
  runId?: string;
  status?: string;
  completedAt?: string;
  rendered?: Array<{ pageNumber: number; path: string }>;
  input?: ComicInput;
};
type CoverManifest = {
  status?: string;
  path?: string;
  completedAt?: string;
  input?: { premise?: string; dramaticQuestion?: string };
};

export const SEASON_EXIT = { ok: 0, failure: 1, usage: 2, notFound: 3 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE = "usage: publication-cli --root <comic-directory> --database <simulator.sqlite> --magic-database <magic.sqlite> season get <season-id>\n";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function commanderNames(deck: { cards: Array<{ board: string; name: string; quantity: number }> }): string[] {
  return deck.cards
    .filter((card) => card.board === "commanders")
    .flatMap((card) => Array.from({ length: card.quantity }, () => card.name));
}

export function scryfallCardUrl(name: string): string {
  return `https://scryfall.com/search?q=${encodeURIComponent(`!\"${name}\"`)}`;
}

function unique(items: Array<string | undefined>): string[] {
  return [...new Set(items.map(text).filter((item): item is string => Boolean(item)))];
}

export function projectSeason(
  seasonId: string,
  comicRoot: string,
  databasePath: string,
  magicDatabasePath: string,
): SeasonProjection {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const magic = new MagicDeckSource(magicDatabasePath);
  try {
    const season = db.prepare("SELECT * FROM comic_seasons WHERE id=?").get(seasonId) as Row | undefined;
    if (!season) throw new Error(`unknown Commander season: ${seasonId}`);
    if (String(season.status) !== "completed" || !text(season.completed_at)) {
      throw new Error(`Commander season ${seasonId} is not completed.`);
    }

    const heroIds = JSON.parse(String(season.hero_public_ids_json)) as string[];
    const rivalIds = JSON.parse(String(season.opponent_public_ids_json)) as string[];
    const deckIds = [...heroIds, ...rivalIds];
    const games = db.prepare("SELECT * FROM season_games WHERE season_id=? ORDER BY game_number").all(seasonId) as Row[];
    const episodes = db.prepare("SELECT * FROM season_episodes WHERE season_id=? ORDER BY day_number").all(seasonId) as Row[];
    if (games.length !== 7 || episodes.length !== 7 || episodes.some((episode) => String(episode.status) !== "published")) {
      throw new Error(`Commander season ${seasonId} must have seven published matches.`);
    }

    const records = new Map(deckIds.map((id) => [id, { games: 0, wins: 0, losses: 0, draws: 0 }]));
    const matches: SeasonMatchProjection[] = [];
    const media: SeasonProjection["media"] = [];

    const seasonDirectory = resolve(comicRoot, "seasons", seasonId);
    const cover = readJson<CoverManifest>(join(seasonDirectory, "cover", "manifest.json"));
    if (cover.status !== "completed" || !cover.path) throw new Error(`Commander season ${seasonId} cover is not completed.`);
    media.push({
      id: "cover",
      path: pathInside(cover.path, seasonDirectory),
      mimeType: "image/png",
      caption: `${String(season.title)} · Cover`,
      altHint: `Cover of the Commander comic season “${String(season.title)}.”`,
    });

    for (const [index, game] of games.entries()) {
      const episode = episodes[index]!;
      if (Number(episode.day_number) !== Number(game.game_number) || String(episode.run_id) !== String(game.run_id)) {
        throw new Error(`Commander season ${seasonId} episode order does not match its games.`);
      }
      const runId = String(game.run_id);
      const participants = JSON.parse(String(game.participant_public_ids_json)) as string[];
      const result = db.prepare("SELECT * FROM simulation_games WHERE run_id=? ORDER BY game_number").get(runId) as Row | undefined;
      if (!result || String(result.status) === "failed") throw new Error(`Commander season match ${index + 1} has no completed result.`);
      const winnerId = text(result.winner_public_id);
      for (const id of participants) {
        const record = records.get(id);
        if (!record) continue;
        record.games++;
        if (!winnerId) record.draws++;
        else if (id === winnerId) record.wins++;
        else record.losses++;
      }

      const manifestPath = join(resolve(comicRoot), runId, "manifest.json");
      if (!existsSync(manifestPath)) throw new Error(`Commander season match ${index + 1} has no comic manifest.`);
      const manifest = readJson<ComicManifest>(manifestPath);
      if (manifest.status !== "completed" || manifest.runId !== runId) {
        throw new Error(`Commander season match ${index + 1} comic is not completed.`);
      }
      const input = (JSON.parse(String(episode.comic_json)) as ComicInput) ?? manifest.input ?? {};
      const pages = [...(input.pages ?? [])].sort((a, b) => Number(a.pageNumber) - Number(b.pageNumber));
      const rendered = [...(manifest.rendered ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);
      if (rendered.length === 0 || rendered.length !== pages.length) {
        throw new Error(`Commander season match ${index + 1} comic pages are incomplete.`);
      }
      const pageByNumber = new Map(pages.map((page) => [Number(page.pageNumber), page]));
      const keyMoments = unique(pages.flatMap((page) => [
        ...(page.panels ?? []).map((panel) => panel.gameplayCue),
        page.storyBeat,
      ]));
      const winnerNames = winnerId ? commanderNames(magic.get(winnerId)) : [];
      matches.push({
        number: index + 1,
        title: text(input.story?.title) ?? String(game.label),
        summary: text(input.summary) ?? String(game.label),
        winnerNames,
        ...(result.turns !== null && result.turns !== undefined ? { turns: Number(result.turns) } : {}),
        keyMoments,
      });
      for (const renderedPage of rendered) {
        const page = pageByNumber.get(renderedPage.pageNumber);
        const pageTitle = text(page?.title) ?? `Page ${renderedPage.pageNumber}`;
        media.push({
          id: `match-${index + 1}-page-${renderedPage.pageNumber}`,
          path: pathInside(renderedPage.path, resolve(comicRoot, runId)),
          mimeType: "image/png",
          caption: `Match ${index + 1} · ${pageTitle}`,
          altHint: `Commander season match ${index + 1}, comic page ${renderedPage.pageNumber} of ${rendered.length}, “${pageTitle}.”${text(page?.storyBeat) ? ` ${text(page?.storyBeat)}` : ""}`,
        });
      }
    }

    const commanders = deckIds.flatMap((deckId) => {
      const deck = magic.get(deckId);
      const record = records.get(deckId)!;
      return commanderNames(deck).map((name) => ({
        name,
        deckName: deck.name,
        deckPublicId: deck.publicId,
        role: heroIds.includes(deckId) ? "hero" as const : "rival" as const,
        scryfallUrl: scryfallCardUrl(name),
        ...record,
      }));
    });
    const title = String(season.title);
    const completedAt = String(season.completed_at);
    return {
      projectionVersion: 1,
      source: { system: "commander-season", recordId: seasonId, version: completedAt },
      occurredAt: completedAt,
      fields: {
        title,
        summary: `${title} is a completed seven-match Commander season told as a sequential comic.`,
        ...(text(cover.input?.premise) ? { premise: text(cover.input?.premise)! } : {}),
        ...(text(cover.input?.dramaticQuestion) ? { dramaticQuestion: text(cover.input?.dramaticQuestion)! } : {}),
        matchCount: matches.length,
        pageCount: media.length,
        commanders,
        matches,
      },
      optInFields: {},
      media,
    };
  } finally {
    magic.close();
    db.close();
  }
}

interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function runSeasonPublicationCli(argv: string[], io: CliIo): number {
  const args = [...argv];
  let comicRoot: string | undefined;
  let database: string | undefined;
  let magicDatabase: string | undefined;
  const positional: string[] = [];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--root") comicRoot = args.shift();
    else if (arg === "--database") database = args.shift();
    else if (arg === "--magic-database") magicDatabase = args.shift();
    else positional.push(arg);
  }
  const [command, seasonId] = positional;
  if (!comicRoot || !database || !magicDatabase || command !== "get" || !seasonId || positional.length !== 2) {
    io.stderr(USAGE);
    return SEASON_EXIT.usage;
  }
  if (!UUID.test(seasonId)) {
    io.stderr(`Commander season ID must be a UUID: ${seasonId}\n`);
    return SEASON_EXIT.notFound;
  }
  try {
    io.stdout(`${JSON.stringify(projectSeason(seasonId, comicRoot, database, magicDatabase))}\n`);
    return SEASON_EXIT.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return message.startsWith("unknown Commander season:") ? SEASON_EXIT.notFound : SEASON_EXIT.failure;
  }
}
