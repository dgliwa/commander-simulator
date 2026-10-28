import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
export class SimulatorDatabase {
    path;
    db;
    constructor(path) {
        this.path = path;
        if (path !== ":memory:") {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
            if (existsSync(path) && !lstatSync(path).isFile())
                throw new Error("Simulator database must be a regular file.");
        }
        this.db = new DatabaseSync(path);
        this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS simulator_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO simulator_metadata(key,value) VALUES('schema_version','2');
      UPDATE simulator_metadata SET value='2' WHERE key='schema_version';
      CREATE TABLE IF NOT EXISTS pods(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pod_participants(
        pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
        seat INTEGER NOT NULL CHECK(seat BETWEEN 1 AND 8),
        public_id TEXT NOT NULL,
        persona TEXT NOT NULL,
        PRIMARY KEY(pod_id,seat),
        UNIQUE(pod_id,public_id)
      );
      CREATE TABLE IF NOT EXISTS simulation_runs(
        id TEXT PRIMARY KEY,
        pod_id TEXT NOT NULL REFERENCES pods(id),
        requested_games INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        timeout_seconds INTEGER NOT NULL,
        status TEXT NOT NULL,
        participants_json TEXT NOT NULL,
        winner_counts_json TEXT NOT NULL,
        draws INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        log_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS simulation_runs_recent ON simulation_runs(created_at DESC);
      CREATE TABLE IF NOT EXISTS simulation_games(
        run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
        game_number INTEGER NOT NULL,
        winner_public_id TEXT,
        turns INTEGER,
        duration_ms INTEGER,
        status TEXT NOT NULL,
        PRIMARY KEY(run_id,game_number)
      );
      CREATE TABLE IF NOT EXISTS comic_seasons(
        id TEXT PRIMARY KEY,
        season_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        hero_public_ids_json TEXT NOT NULL,
        opponent_public_ids_json TEXT NOT NULL,
        style_seed TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS season_games(
        season_id TEXT NOT NULL REFERENCES comic_seasons(id) ON DELETE CASCADE,
        game_number INTEGER NOT NULL CHECK(game_number BETWEEN 1 AND 7),
        label TEXT NOT NULL,
        pod_id TEXT NOT NULL REFERENCES pods(id),
        run_id TEXT NOT NULL UNIQUE REFERENCES simulation_runs(id),
        participant_public_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(season_id,game_number)
      );
      CREATE TABLE IF NOT EXISTS season_episodes(
        season_id TEXT NOT NULL REFERENCES comic_seasons(id) ON DELETE CASCADE,
        day_number INTEGER NOT NULL CHECK(day_number BETWEEN 1 AND 7),
        run_id TEXT NOT NULL REFERENCES simulation_runs(id),
        status TEXT NOT NULL,
        comic_json TEXT NOT NULL,
        published_at TEXT,
        PRIMARY KEY(season_id,day_number)
      );
      CREATE INDEX IF NOT EXISTS comic_seasons_recent ON comic_seasons(created_at DESC);
      CREATE INDEX IF NOT EXISTS season_episodes_status ON season_episodes(season_id,status,day_number);
    `);
        if (path !== ":memory:")
            chmodSync(path, 0o600);
    }
    close() {
        this.db.close();
    }
    createPod(name, participants, now = new Date().toISOString()) {
        const id = randomUUID();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            this.db.prepare("INSERT INTO pods(id,name,created_at,updated_at) VALUES(?,?,?,?)").run(id, name, now, now);
            this.replaceParticipants(id, participants);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.getPod(id);
    }
    updatePod(id, input, now = new Date().toISOString()) {
        this.getPod(id);
        this.db.exec("BEGIN IMMEDIATE");
        try {
            if (input.name !== undefined)
                this.db.prepare("UPDATE pods SET name=?,updated_at=? WHERE id=?").run(input.name, now, id);
            else
                this.db.prepare("UPDATE pods SET updated_at=? WHERE id=?").run(now, id);
            if (input.participants)
                this.replaceParticipants(id, input.participants);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.getPod(id);
    }
    deletePod(id) {
        const runCount = Number(this.db.prepare("SELECT count(*) AS count FROM simulation_runs WHERE pod_id=?").get(id)?.count ?? 0);
        if (runCount)
            throw new Error("Cannot delete a pod with simulation history.");
        const result = this.db.prepare("DELETE FROM pods WHERE id=?").run(id);
        if (!result.changes)
            throw new Error(`Unknown pod: ${id}`);
        return { deleted: id };
    }
    listPods() {
        return this.db.prepare("SELECT id FROM pods ORDER BY updated_at DESC,name").all().map(row => this.getPod(String(row.id)));
    }
    getPod(id) {
        const row = this.db.prepare("SELECT * FROM pods WHERE id=?").get(id);
        if (!row)
            throw new Error(`Unknown pod: ${id}`);
        const participants = this.db.prepare("SELECT seat,public_id,persona FROM pod_participants WHERE pod_id=? ORDER BY seat").all(id).map(item => ({
            seat: Number(item.seat),
            publicId: String(item.public_id),
            persona: String(item.persona),
        }));
        return { id, name: String(row.name), participants, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
    }
    startRun(input, now = new Date().toISOString()) {
        this.db.prepare(`
      INSERT INTO simulation_runs(
        id,pod_id,requested_games,seed,timeout_seconds,status,participants_json,
        winner_counts_json,draws,error,log_path,created_at
      ) VALUES(?,?,?,?,?,'running',?,'{}',0,?,?,?)
    `).run(input.id, input.podId, input.requestedGames, input.seed, input.timeoutSeconds, JSON.stringify(input.participants), input.error ?? null, input.logPath, now);
        return this.getRun(input.id);
    }
    finishRun(id, games, error, now = new Date().toISOString()) {
        const winnerCounts = {};
        let draws = 0;
        for (const game of games) {
            if (game.winnerPublicId)
                winnerCounts[game.winnerPublicId] = (winnerCounts[game.winnerPublicId] ?? 0) + 1;
            else if (game.status === "draw")
                draws++;
        }
        const status = error ? (games.length ? "completed_with_errors" : "failed") : "completed";
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const insert = this.db.prepare("INSERT INTO simulation_games(run_id,game_number,winner_public_id,turns,duration_ms,status) VALUES(?,?,?,?,?,?)");
            for (const game of games)
                insert.run(id, game.gameNumber, game.winnerPublicId ?? null, game.turns ?? null, game.durationMs ?? null, game.status);
            this.db.prepare("UPDATE simulation_runs SET status=?,winner_counts_json=?,draws=?,error=?,completed_at=? WHERE id=?").run(status, JSON.stringify(winnerCounts), draws, error ?? null, now, id);
            this.db.exec("COMMIT");
        }
        catch (cause) {
            this.db.exec("ROLLBACK");
            throw cause;
        }
        return this.getRun(id);
    }
    listRuns(limit = 25) {
        return this.db.prepare("SELECT id FROM simulation_runs ORDER BY created_at DESC LIMIT ?").all(limit).map(row => this.getRun(String(row.id)));
    }
    getRun(id) {
        const row = this.db.prepare("SELECT * FROM simulation_runs WHERE id=?").get(id);
        if (!row)
            throw new Error(`Unknown simulation run: ${id}`);
        const games = this.db.prepare("SELECT * FROM simulation_games WHERE run_id=? ORDER BY game_number").all(id).map(game => ({
            gameNumber: Number(game.game_number),
            winnerPublicId: game.winner_public_id ? String(game.winner_public_id) : undefined,
            turns: game.turns === null || game.turns === undefined ? undefined : Number(game.turns),
            durationMs: game.duration_ms === null || game.duration_ms === undefined ? undefined : Number(game.duration_ms),
            status: String(game.status),
        }));
        return {
            id,
            podId: String(row.pod_id),
            requestedGames: Number(row.requested_games),
            seed: Number(row.seed),
            timeoutSeconds: Number(row.timeout_seconds),
            status: String(row.status),
            participants: JSON.parse(String(row.participants_json)),
            games,
            winnerCounts: JSON.parse(String(row.winner_counts_json)),
            draws: Number(row.draws),
            error: row.error ? String(row.error) : undefined,
            logPath: String(row.log_path),
            createdAt: String(row.created_at),
            completedAt: row.completed_at ? String(row.completed_at) : undefined,
        };
    }
    createSeason(input, now = new Date().toISOString()) {
        const id = randomUUID();
        this.db.prepare(`
      INSERT INTO comic_seasons(id,season_key,title,status,hero_public_ids_json,opponent_public_ids_json,style_seed,created_at,updated_at)
      VALUES(?,?,?,'draft',?,?,?,?,?)
    `).run(id, input.seasonKey, input.title, JSON.stringify(input.heroPublicIds), JSON.stringify(input.opponentPublicIds), input.styleSeed ?? id, now, now);
        return this.getSeason(id);
    }
    getSeason(id) {
        const row = this.db.prepare("SELECT * FROM comic_seasons WHERE id=?").get(id);
        if (!row)
            throw new Error(`Unknown comic season: ${id}`);
        return {
            id,
            seasonKey: String(row.season_key),
            title: String(row.title),
            status: String(row.status),
            heroPublicIds: JSON.parse(String(row.hero_public_ids_json)),
            opponentPublicIds: JSON.parse(String(row.opponent_public_ids_json)),
            styleSeed: String(row.style_seed),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            completedAt: row.completed_at ? String(row.completed_at) : undefined,
        };
    }
    listSeasons(limit = 20) {
        return this.db.prepare("SELECT id FROM comic_seasons ORDER BY created_at DESC LIMIT ?").all(limit).map(row => this.getSeason(String(row.id)));
    }
    updateSeasonStatus(id, status, now = new Date().toISOString()) {
        const completedAt = status === "completed" ? now : null;
        const result = this.db.prepare("UPDATE comic_seasons SET status=?,updated_at=?,completed_at=COALESCE(?,completed_at) WHERE id=?").run(status, now, completedAt, id);
        if (!result.changes)
            throw new Error(`Unknown comic season: ${id}`);
        return this.getSeason(id);
    }
    addSeasonGame(input, now = new Date().toISOString()) {
        this.db.prepare(`
      INSERT INTO season_games(season_id,game_number,label,pod_id,run_id,participant_public_ids_json,created_at)
      VALUES(?,?,?,?,?,?,?)
    `).run(input.seasonId, input.gameNumber, input.label, input.podId, input.runId, JSON.stringify(input.participantPublicIds), now);
        return this.getSeasonGames(input.seasonId).find(game => game.gameNumber === input.gameNumber);
    }
    getSeasonGames(seasonId) {
        return this.db.prepare("SELECT * FROM season_games WHERE season_id=? ORDER BY game_number").all(seasonId).map(row => ({
            seasonId,
            gameNumber: Number(row.game_number),
            label: String(row.label),
            podId: String(row.pod_id),
            runId: String(row.run_id),
            participantPublicIds: JSON.parse(String(row.participant_public_ids_json)),
            createdAt: String(row.created_at),
        }));
    }
    saveSeasonPlan(seasonId, episodes, now = new Date().toISOString()) {
        this.getSeason(seasonId);
        const existing = Number(this.db.prepare("SELECT count(*) AS count FROM season_episodes WHERE season_id=?").get(seasonId).count);
        if (existing)
            throw new Error("This season already has a stored episode plan.");
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const insert = this.db.prepare("INSERT INTO season_episodes(season_id,day_number,run_id,status,comic_json) VALUES(?,?,?,'planned',?)");
            for (const episode of episodes)
                insert.run(seasonId, episode.dayNumber, episode.runId, JSON.stringify(episode.comic));
            this.db.prepare("UPDATE comic_seasons SET status='ready',updated_at=? WHERE id=?").run(now, seasonId);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
        return this.getSeasonEpisodes(seasonId);
    }
    getSeasonEpisodes(seasonId) {
        return this.db.prepare("SELECT * FROM season_episodes WHERE season_id=? ORDER BY day_number").all(seasonId).map(row => ({
            seasonId,
            dayNumber: Number(row.day_number),
            runId: String(row.run_id),
            status: String(row.status),
            comic: JSON.parse(String(row.comic_json)),
            publishedAt: row.published_at ? String(row.published_at) : undefined,
        }));
    }
    updateEpisodeStatus(seasonId, dayNumber, status, publishedAt) {
        const result = this.db.prepare("UPDATE season_episodes SET status=?,published_at=COALESCE(?,published_at) WHERE season_id=? AND day_number=?").run(status, publishedAt ?? null, seasonId, dayNumber);
        if (!result.changes)
            throw new Error(`Unknown season episode: ${seasonId} day ${dayNumber}`);
        return this.getSeasonEpisodes(seasonId).find(episode => episode.dayNumber === dayNumber);
    }
    standings() {
        const rows = this.db.prepare(`
      WITH participants AS (
        SELECT r.id AS run_id,
          json_extract(p.value,'$.publicId') AS public_id,
          json_extract(p.value,'$.name') AS deck_name,
          json_extract(p.value,'$.persona') AS persona
        FROM simulation_runs r,json_each(r.participants_json) p
        WHERE r.status IN ('completed','completed_with_errors')
      )
      SELECT p.public_id,p.deck_name,p.persona,
        COUNT(*) AS games,
        SUM(CASE WHEN g.winner_public_id=p.public_id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN g.status='draw' THEN 1 ELSE 0 END) AS draws
      FROM participants p
      JOIN simulation_games g ON g.run_id=p.run_id
      WHERE g.status IN ('completed','draw')
      GROUP BY p.public_id,p.deck_name,p.persona
      ORDER BY wins DESC,games DESC,p.deck_name,p.persona
    `).all();
        const deckPersonas = rows.map(row => {
            const games = Number(row.games);
            const wins = Number(row.wins);
            const draws = Number(row.draws);
            return {
                publicId: String(row.public_id),
                deckName: String(row.deck_name),
                persona: String(row.persona),
                games,
                wins,
                losses: games - wins - draws,
                draws,
                winRate: games ? wins / games : 0,
            };
        });
        return { deckPersonas };
    }
    summary() {
        const row = this.db.prepare(`
      SELECT (SELECT count(*) FROM pods) AS pods,
        (SELECT count(*) FROM simulation_runs) AS runs,
        (SELECT count(*) FROM simulation_games) AS games,
        (SELECT max(completed_at) FROM simulation_runs) AS last_completed_at
    `).get();
        return { path: this.path, pods: Number(row.pods), runs: Number(row.runs), games: Number(row.games), lastCompletedAt: row.last_completed_at ? String(row.last_completed_at) : undefined };
    }
    replaceParticipants(podId, participants) {
        this.db.prepare("DELETE FROM pod_participants WHERE pod_id=?").run(podId);
        const insert = this.db.prepare("INSERT INTO pod_participants(pod_id,seat,public_id,persona) VALUES(?,?,?,?)");
        for (const participant of participants)
            insert.run(podId, participant.seat, participant.publicId, participant.persona);
    }
}
