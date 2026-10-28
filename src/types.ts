export const FORGE_PERSONAS = ["Default", "Cautious", "Reckless", "Experimental"] as const;
export type ForgePersona = typeof FORGE_PERSONAS[number];

export interface PodParticipant {
  publicId: string;
  persona: ForgePersona;
  seat: number;
}

export interface Pod {
  id: string;
  name: string;
  participants: PodParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface MagicDeckRecord {
  publicId: string;
  name: string;
  format?: string;
  visibility?: string;
  publicUrl: string;
  archivedAt?: string;
  snapshotRefreshedAt?: string;
  tags: string[];
  cards: MagicDeckCard[];
}

export interface MagicDeckCard {
  board: "commanders" | "mainboard" | "sideboard" | "maybeboard";
  position: number;
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
}

export interface SimulationGame {
  gameNumber: number;
  winnerPublicId?: string;
  turns?: number;
  durationMs?: number;
  status: "completed" | "draw" | "failed";
}

export type SeasonStatus = "draft" | "simulating" | "awaiting_plan" | "ready" | "publishing" | "completed";
export type SeasonEpisodeStatus = "planned" | "queued" | "running" | "published" | "failed";

export interface ComicSeason {
  id: string;
  seasonKey: string;
  title: string;
  status: SeasonStatus;
  heroPublicIds: string[];
  opponentPublicIds: string[];
  styleSeed: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SeasonGame {
  seasonId: string;
  gameNumber: number;
  label: string;
  podId: string;
  runId: string;
  participantPublicIds: string[];
  createdAt: string;
}

export interface SeasonEpisode {
  seasonId: string;
  dayNumber: number;
  runId: string;
  status: SeasonEpisodeStatus;
  comic: unknown;
  publishedAt?: string;
}

export interface SimulationRun {
  id: string;
  podId: string;
  requestedGames: number;
  seed: number;
  timeoutSeconds: number;
  status: "running" | "completed" | "completed_with_errors" | "failed";
  participants: Array<PodParticipant & { name: string; commanderNames: string[] }>;
  games: SimulationGame[];
  winnerCounts: Record<string, number>;
  draws: number;
  error?: string;
  logPath: string;
  createdAt: string;
  completedAt?: string;
}
