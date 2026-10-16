import type { MagicDeckRecord } from "./types.js";
export declare class MagicDeckSource {
    private readonly db;
    constructor(path: string);
    close(): void;
    get(publicId: string): MagicDeckRecord;
    compatibility(publicId: string): {
        deck: {
            publicId: string;
            name: string;
            publicUrl: string;
        };
        commanderCount: number;
        mainboardCount: number;
        total: number;
        transformedNames: {
            source: string;
            forge: string;
        }[];
        warnings: string[];
        compatible: boolean;
    };
}
export declare function forgeCardName(name: string): string;
