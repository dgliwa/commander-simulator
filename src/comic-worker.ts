import { join, resolve } from "node:path";
import { ComicPublisher, readWorkerRequest } from "./comic-publisher.js";
import { ComicRenderer, writeManifest } from "./comic-renderer.js";

const requestPath = process.argv[2];
if (!requestPath) throw new Error("Comic worker requires a request path.");

try {
  const request = readWorkerRequest(requestPath);
  const renderer = new ComicRenderer(request.comicRoot, request.discordTarget, request.openclawCommand);
  await renderer.publish(request.input);
} catch (error) {
  let manifestPath: string | undefined;
  try {
    const request = readWorkerRequest(requestPath);
    manifestPath = join(resolve(request.comicRoot, request.input.runId), "manifest.json");
    const publisher = new ComicPublisher(request.comicRoot, request.discordTarget, request.openclawCommand);
    const current = publisher.status(request.input.runId);
    writeManifest(manifestPath, {
      ...current,
      status: "failed",
      runId: request.input.runId,
      storyTitle: request.input.story.title,
      pageCount: request.input.pages.length,
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    });
  } catch {
    // The detached worker log remains the final fallback when the request itself is unreadable.
  }
  process.exitCode = 1;
}
