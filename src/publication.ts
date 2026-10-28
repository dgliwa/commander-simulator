import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const EXIT = { ok: 0, failure: 1, usage: 2, notFound: 3 } as const;

export interface ComicProjection {
  projectionVersion: 1;
  source: { system: "commander-comic"; recordId: string; version: string };
  occurredAt: string;
  fields: {
    title: string;
    summary: string;
    premise?: string;
    dramaticQuestion?: string;
    seriesLabel?: string;
    pageCount: number;
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

interface CompletedManifest {
  runId: string;
  status: string;
  storyTitle?: string;
  pageCount?: number;
  completedAt?: string;
  rendered?: Array<{ pageNumber: number; path: string }>;
  input?: {
    summary?: string;
    seriesLabel?: string;
    story?: { title?: string; premise?: string; dramaticQuestion?: string };
    pages?: Array<{ pageNumber: number; title?: string; storyBeat?: string }>;
  };
}

interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

const USAGE = "usage: publication-cli --root <comic-directory> get <run-id>\n";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pathInside(path: string, root: string): string {
  const realRoot = realpathSync(root);
  const realPath = realpathSync(path);
  const rel = relative(realRoot, realPath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Comic page escapes its run directory.");
  return realPath;
}

export function projectComic(manifest: CompletedManifest, comicRoot: string): ComicProjection {
  if (manifest.status !== "completed") throw new Error("Comic run is not completed.");
  if (!UUID.test(manifest.runId)) throw new Error("Comic manifest has an invalid run ID.");
  const completedAt = text(manifest.completedAt);
  const title = text(manifest.input?.story?.title) ?? text(manifest.storyTitle);
  const summary = text(manifest.input?.summary);
  const rendered = [...(manifest.rendered ?? [])].sort((a, b) => a.pageNumber - b.pageNumber);
  if (!completedAt || !title || !summary || rendered.length === 0) throw new Error("Completed comic manifest is missing publication fields.");
  const pages = new Map((manifest.input?.pages ?? []).map((page) => [page.pageNumber, page]));
  const runDirectory = resolve(comicRoot, manifest.runId);
  const pageCount = rendered.length;
  return {
    projectionVersion: 1,
    source: { system: "commander-comic", recordId: manifest.runId, version: completedAt },
    occurredAt: completedAt,
    fields: {
      title,
      summary,
      ...(text(manifest.input?.story?.premise) ? { premise: text(manifest.input?.story?.premise)! } : {}),
      ...(text(manifest.input?.story?.dramaticQuestion) ? { dramaticQuestion: text(manifest.input?.story?.dramaticQuestion)! } : {}),
      ...(text(manifest.input?.seriesLabel) ? { seriesLabel: text(manifest.input?.seriesLabel)! } : {}),
      pageCount,
    },
    optInFields: {},
    media: rendered.map((item, index) => {
      const page = pages.get(item.pageNumber);
      const pageTitle = text(page?.title) ?? `Page ${item.pageNumber}`;
      const storyBeat = text(page?.storyBeat);
      return {
        id: `page-${item.pageNumber}`,
        path: pathInside(item.path, runDirectory),
        mimeType: "image/png",
        caption: `${pageTitle} · ${item.pageNumber} of ${pageCount}`,
        altHint: `Comic page ${item.pageNumber} of ${pageCount}, “${pageTitle}.”${storyBeat ? ` ${storyBeat}` : ""}`,
      };
    }),
  };
}

export function runPublicationCli(argv: string[], io: CliIo): number {
  const args = [...argv];
  let comicRoot: string | undefined;
  const positional: string[] = [];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--root") comicRoot = args.shift();
    else positional.push(arg);
  }
  const [command, runId] = positional;
  if (!comicRoot || command !== "get" || !runId || positional.length !== 2) {
    io.stderr(USAGE);
    return EXIT.usage;
  }
  if (!UUID.test(runId)) {
    io.stderr(`comic run ID must be a UUID: ${runId}\n`);
    return EXIT.notFound;
  }
  const manifestPath = join(resolve(comicRoot), runId, "manifest.json");
  if (!existsSync(manifestPath)) {
    io.stderr(`unknown comic run ID: ${runId}\n`);
    return EXIT.notFound;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CompletedManifest;
    if (manifest.runId !== runId) throw new Error("Comic manifest run ID does not match its directory.");
    io.stdout(`${JSON.stringify(projectComic(manifest, comicRoot))}\n`);
    return EXIT.ok;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.failure;
  }
}
