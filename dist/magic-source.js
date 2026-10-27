import { DatabaseSync } from "node:sqlite";
export class MagicDeckSource {
    db;
    constructor(path) {
        this.db = new DatabaseSync(path, { readOnly: true });
    }
    close() {
        this.db.close();
    }
    listBuilt() {
        return this.db.prepare(`
      SELECT d.public_id,d.name,d.public_url,d.snapshot_refreshed_at,
        COALESCE(SUM(CASE WHEN c.board IN ('commanders','mainboard') THEN c.quantity ELSE 0 END),0) AS card_count
      FROM moxfield_decks d
      JOIN moxfield_deck_tags t ON t.public_id=d.public_id AND t.tag='built'
      LEFT JOIN moxfield_deck_cards c ON c.public_id=d.public_id
      WHERE d.archived_at IS NULL
      GROUP BY d.public_id ORDER BY d.name COLLATE NOCASE
    `).all().map(row => ({
            publicId: String(row.public_id),
            name: String(row.name),
            publicUrl: String(row.public_url),
            cardCount: Number(row.card_count),
            snapshotRefreshedAt: row.snapshot_refreshed_at ? String(row.snapshot_refreshed_at) : undefined,
            tags: this.tags(String(row.public_id)),
        }));
    }
    listOwnedBuilt() {
        return this.listBuilt().filter(deck => !deck.tags.includes("generated") && !deck.tags.includes("not-owned"));
    }
    listGeneratedBuilt() {
        return this.listBuilt().filter(deck => deck.tags.includes("generated") && deck.tags.includes("not-owned"));
    }
    get(publicId) {
        const row = this.db.prepare("SELECT * FROM moxfield_decks WHERE public_id=?").get(publicId);
        if (!row)
            throw new Error(`Unknown Magic Workspace deck: ${publicId}`);
        const cards = this.db.prepare(`
      SELECT board,position,name,quantity,set_code,collector_number
      FROM moxfield_deck_cards WHERE public_id=?
      ORDER BY CASE board WHEN 'commanders' THEN 0 WHEN 'mainboard' THEN 1 WHEN 'sideboard' THEN 2 ELSE 3 END,position
    `).all(publicId).map(item => ({
            board: String(item.board),
            position: Number(item.position),
            name: String(item.name),
            quantity: Number(item.quantity),
            set: item.set_code ? String(item.set_code) : undefined,
            collectorNumber: item.collector_number ? String(item.collector_number) : undefined,
        }));
        if (!cards.length)
            throw new Error(`Deck ${publicId} has no cached snapshot.`);
        const tags = this.db.prepare("SELECT tag FROM moxfield_deck_tags WHERE public_id=? ORDER BY tag").all(publicId).map(item => String(item.tag));
        return {
            publicId,
            name: String(row.name),
            format: row.format ? String(row.format) : undefined,
            visibility: row.visibility ? String(row.visibility) : undefined,
            publicUrl: String(row.public_url),
            archivedAt: row.archived_at ? String(row.archived_at) : undefined,
            snapshotRefreshedAt: row.snapshot_refreshed_at ? String(row.snapshot_refreshed_at) : undefined,
            tags,
            cards,
        };
    }
    compatibility(publicId) {
        const deck = this.get(publicId);
        const commanders = deck.cards.filter(card => card.board === "commanders");
        const mainboard = deck.cards.filter(card => card.board === "mainboard");
        const commanderCount = commanders.reduce((sum, card) => sum + card.quantity, 0);
        const mainboardCount = mainboard.reduce((sum, card) => sum + card.quantity, 0);
        const transformedNames = [...commanders, ...mainboard].filter(card => card.name.includes(" // ")).map(card => ({ source: card.name, forge: forgeCardName(card.name) }));
        const warnings = [];
        if (deck.archivedAt)
            warnings.push("Deck is archived in Magic Workspace.");
        if (deck.format?.toLowerCase() !== "commander")
            warnings.push(`Deck format is ${deck.format ?? "unknown"}, not Commander.`);
        if (commanderCount < 1 || commanderCount > 2)
            warnings.push(`Expected one or two commanders; found ${commanderCount}.`);
        if (commanderCount + mainboardCount !== 100)
            warnings.push(`Commander plus mainboard contains ${commanderCount + mainboardCount} cards instead of 100.`);
        if (!deck.tags.includes("built"))
            warnings.push("Deck is not tagged built in Magic Workspace.");
        return { deck: { publicId: deck.publicId, name: deck.name, publicUrl: deck.publicUrl, tags: deck.tags }, commanderCount, mainboardCount, total: commanderCount + mainboardCount, transformedNames, warnings, compatible: warnings.length === 0 };
    }
    tags(publicId) {
        return this.db.prepare("SELECT tag FROM moxfield_deck_tags WHERE public_id=? ORDER BY tag").all(publicId).map(item => String(item.tag));
    }
}
export function forgeCardName(name) {
    return name.split(" // ")[0].trim();
}
