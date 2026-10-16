import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
function expandHome(path) {
    return resolve(path.replace(/^~(?=\/)/, homedir()));
}
function within(parent, child) {
    const rel = relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function statePath(stateDir, configured, fallback) {
    const root = resolve(stateDir);
    if (!configured)
        return resolve(root, fallback);
    if (configured.includes("\0"))
        throw new Error("Configured path cannot contain null bytes.");
    if (isAbsolute(configured) || configured.startsWith("~/"))
        return expandHome(configured);
    const path = resolve(root, configured);
    if (!within(root, path))
        throw new Error("Relative paths must remain inside OpenClaw state.");
    return path;
}
export function resolveSimulatorPaths(stateDir, config) {
    const runtime = expandHome(String(config.runtimePath ?? "~/.local/share/commander-simulator"));
    const forgeDirectory = resolve(runtime, "runtime/forge/current");
    const java = expandHome(String(config.javaPath ?? resolve(runtime, "runtime/java/current/bin/java")));
    const forgeJar = expandHome(String(config.forgeJarPath ?? resolve(forgeDirectory, "forge-gui-desktop-2.0.15-jar-with-dependencies.jar")));
    const database = statePath(stateDir, config.databasePath, "plugins/commander-simulator/simulator.sqlite");
    const magicDatabase = statePath(stateDir, config.magicDatabasePath, "plugins/magic-workspace/magic.sqlite");
    const data = resolve(runtime, "data");
    const deckDirectory = resolve(data, "decks/commander");
    const logDirectory = resolve(data, "logs");
    for (const directory of [resolve(database, ".."), data, deckDirectory, logDirectory]) {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    for (const [label, path] of [["Java runtime", java], ["Forge jar", forgeJar], ["Magic Workspace database", magicDatabase]]) {
        if (!existsSync(path) || !lstatSync(path).isFile())
            throw new Error(`${label} not found: ${path}`);
    }
    return { database, magicDatabase, java, forgeJar, forgeDirectory, deckDirectory, logDirectory };
}
