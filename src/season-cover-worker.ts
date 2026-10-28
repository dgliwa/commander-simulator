import { join, resolve } from "node:path";
import { writeManifest } from "./comic-renderer.js";
import { SeasonCoverPublisher, readSeasonCoverWorkerRequest } from "./season-cover-publisher.js";
import { SeasonCoverRenderer } from "./season-cover-renderer.js";

const requestPath = process.argv[2];
if (!requestPath) throw new Error("Season cover worker requires a request path.");

try {
  const request = readSeasonCoverWorkerRequest(requestPath);
  const renderer = new SeasonCoverRenderer(request.comicRoot, request.discordTarget, request.openclawCommand);
  await renderer.publish(request.input);
} catch (error) {
  try {
    const request = readSeasonCoverWorkerRequest(requestPath);
    const manifestPath = join(resolve(request.comicRoot, "seasons", request.input.seasonId, "cover"), "manifest.json");
    const publisher = new SeasonCoverPublisher(request.comicRoot, request.discordTarget, request.openclawCommand);
    const current = publisher.status(request.input.seasonId);
    const renderer = new SeasonCoverRenderer(request.comicRoot, request.discordTarget, request.openclawCommand);
    const failureDelivery = await renderer.reportFailure(request.input, error).catch(deliveryError => ({
      status: "failed",
      error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
    }));
    writeManifest(manifestPath, {
      ...current,
      status: "failed",
      seasonId: request.input.seasonId,
      seasonTitle: request.input.seasonTitle,
      error: error instanceof Error ? error.message : String(error),
      failureDelivery,
      completedAt: new Date().toISOString(),
      input: request.input,
    });
  } catch {
    // The detached worker log remains the final fallback when the request itself is unreadable.
  }
  process.exitCode = 1;
}
