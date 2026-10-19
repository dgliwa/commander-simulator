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
  try {
    const request = readWorkerRequest(requestPath);
    const manifestPath = join(resolve(request.comicRoot, request.input.runId), "manifest.json");
    const publisher = new ComicPublisher(request.comicRoot, request.discordTarget, request.openclawCommand);
    const current = publisher.status(request.input.runId);
    const renderer = new ComicRenderer(request.comicRoot, request.discordTarget, request.openclawCommand);
    const failureDelivery = await renderer.reportFailure(request.input, error).catch((deliveryError) => ({
      status: "failed",
      error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
    }));
    writeManifest(manifestPath, {
      ...current,
      status: "failed",
      runId: request.input.runId,
      storyTitle: request.input.story.title,
      pageCount: request.input.pages.length,
      error: error instanceof Error ? error.message : String(error),
      failureDelivery,
      completedAt: new Date().toISOString(),
    });
  } catch {
    // The detached worker log remains the final fallback when the request itself is unreadable.
  }
  process.exitCode = 1;
}
