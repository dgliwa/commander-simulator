import { DatabaseSync } from "node:sqlite";
import type { MagicDeckCard, MagicDeckRecord } from "./types.js";

type Row = Record<string, unknown>;

export class MagicDeckSource {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  close(): void {
    this.db.close();
  }

  get(publicId: string): MagicDeckRecord {
    const row = this.db.prepare("SELECT * FROM moxfield_decks WHERE public_id=?").get(publicId) as Row | undefined;
    if (!row) throw new Error(`Unknown Magic Workspace deck: ${publicId}`);
    const cards = (this.db.prepare(`
      SELECT board,position,name,quantity,set_code,collector_number
      FROM moxfield_deck_cards WHERE public_id=?
      ORDER BY CASE board WHEN 'commanders' THEN 0 WHEN 'mainboard' THEN 1 WHEN 'sideboard' THEN 2 ELSE 3 END,position
    `).all(publicId) as Row[]).map(item => ({
      board: String(item.board) as MagicDeckCard["board"],
      position: Number(item.position),
      name: String(item.name),
      quantity: Number(item.quantity),
      set: item.set_code ? String(item.set_code) : undefined,
      collectorNumber: item.collector_number ? String(item.collector_number) : undefined,
    }));
    if (!cards.length) throw new Error(`Deck ${publicId} has no cached snapshot.`);
    return {
      publicId,
      name: String(row.name),
      format: row.format ? String(row.format) : undefined,
      visibility: row.visibility ? String(row.visibility) : undefined,
      publicUrl: String(row.public_url),
      archivedAt: row.archived_at ? String(row.archived_at) : undefined,
      snapshotRefreshedAt: row.snapshot_refreshed_at ? String(row.snapshot_refreshed_at) : undefined,
      cards,
    };
  }

  compatibility(publicId: string) {
    const deck = this.get(publicId);
    const commanders = deck.cards.filter(card => card.board === "commanders");
    const mainboard = deck.cards.filter(card => card.board === "mainboard");
    const commanderCount = commanders.reduce((sum, card) => sum + card.quantity, 0);
    const mainboardCount = mainboard.reduce((sum, card) => sum + card.quantity, 0);
    const transformedNames = [...commanders, ...mainboard].filter(card => card.name.includes(" // ")).map(card => ({ source: card.name, forge: forgeCardName(card.name) }));
    const warnings: string[] = [];
    if (deck.archivedAt) warnings.push("Deck is archived in Magic Workspace.");
    if (deck.format?.toLowerCase() !== "commander") warnings.push(`Deck format is ${deck.format ?? "unknown"}, not Commander.`);
    if (commanderCount < 1 || commanderCount > 2) warnings.push(`Expected one or two commanders; found ${commanderCount}.`);
    if (commanderCount + mainboardCount !== 100) warnings.push(`Commander plus mainboard contains ${commanderCount + mainboardCount} cards instead of 100.`);
    return { deck: { publicId: deck.publicId, name: deck.name, publicUrl: deck.publicUrl }, commanderCount, mainboardCount, total: commanderCount + mainboardCount, transformedNames, warnings, compatible: warnings.length === 0 };
  }
}

export function forgeCardName(name: string): string {
  return name.split(" // ")[0]!.trim();
}
