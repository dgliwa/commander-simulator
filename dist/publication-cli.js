#!/usr/bin/env node
import { runPublicationCli } from "./publication.js";
import { runSeasonPublicationCli } from "./season-publication.js";
const args = process.argv.slice(2);
const seasonIndex = args.indexOf("season");
const runner = seasonIndex >= 0 ? runSeasonPublicationCli : runPublicationCli;
const runnerArgs = seasonIndex >= 0 ? [...args.slice(0, seasonIndex), ...args.slice(seasonIndex + 1)] : args;
process.exitCode = runner(runnerArgs, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
});
