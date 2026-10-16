export interface SimulatorPaths {
    database: string;
    magicDatabase: string;
    java: string;
    forgeJar: string;
    forgeDirectory: string;
    deckDirectory: string;
    logDirectory: string;
    comicDirectory: string;
}
export declare function resolveSimulatorPaths(stateDir: string, config: Record<string, unknown>): SimulatorPaths;
