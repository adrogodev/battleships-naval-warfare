import { z } from "zod";
import {
  type KeyValueStorage,
  readSave,
  removeSave,
  type SaveFormat,
  safeLocalStorage,
  settingsStore,
  writeSave,
} from "../settings/settingsStore";
import { CHALLENGE_IDS, type ChallengeId } from "./challenges";
import type { GameRecord } from "./game";
import {
  applyGame,
  EMPTY_PROGRESS,
  HEATMAP_SIZE,
  type PlayerProgress,
  type ProgressReport,
  RECENT_GAME_IDS,
} from "./progress";

export const PROGRESS_KEY = "battleships.progress";
/** Every localStorage key of this game starts with this prefix (settings, progress, tutorial…). */
export const SAVE_PREFIX = "battleships.";

const PROGRESS_FORMAT: SaveFormat = {
  key: PROGRESS_KEY,
  field: "progress",
  version: 1,
  migrations: {
    // v0: unversioned object holding the progress fields directly.
    0: (save) => ({ version: 1, data: save.data }),
  },
};

const count = z.number().int().min(0);
const modeRecord = z.object({ played: count, won: count });

const progressSchema = z.object({
  xp: count,
  games: count,
  wins: count,
  byMode: z.object({
    ai: z.object({ easy: modeRecord, normal: modeRecord, hard: modeRecord }),
    online: modeRecord,
  }),
  accuracySum: z.number().min(0),
  accuracyGames: count,
  bestStreak: count,
  shortestWinShots: count.nullable(),
  heatmap: z.array(count).length(HEATMAP_SIZE * HEATMAP_SIZE),
  // Unknown challenge ids (e.g. a removed challenge) are dropped, not the whole list.
  completed: z
    .array(z.unknown())
    .transform((ids) =>
      ids.filter((id): id is ChallengeId => CHALLENGE_IDS.includes(id as ChallengeId)),
    ),
  recentGameIds: z.array(z.string()).transform((ids) => ids.slice(-RECENT_GAME_IDS)),
});

/** Field-by-field recovery: a bad field falls back to its empty value without losing the others. */
function sanitize(input: unknown): PlayerProgress {
  if (input === null || typeof input !== "object") return EMPTY_PROGRESS;
  const record = input as Record<string, unknown>;
  const result: Record<string, unknown> = { ...EMPTY_PROGRESS };
  for (const key of Object.keys(progressSchema.shape) as (keyof PlayerProgress)[]) {
    const parsed = progressSchema.shape[key].safeParse(record[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as unknown as PlayerProgress;
}

export interface ProgressStore {
  get(): PlayerProgress;
  subscribe(listener: () => void): () => void;
  /** Counts a finished game; null when this game id was already counted. */
  recordGame(game: GameRecord): ProgressReport | null;
  clear(): void;
}

export function createProgressStore(storage: KeyValueStorage | null): ProgressStore {
  const raw = readSave(storage, PROGRESS_FORMAT);
  let current = raw === undefined ? EMPTY_PROGRESS : sanitize(raw);
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recordGame(game) {
      const { progress, report } = applyGame(current, game);
      if (!report) return null;
      current = progress;
      writeSave(storage, PROGRESS_FORMAT, current);
      emit();
      return report;
    },
    clear() {
      current = EMPTY_PROGRESS;
      removeSave(storage, PROGRESS_KEY);
      emit();
    },
  };
}

/** App-wide instance backed by localStorage. */
export const progressStore = createProgressStore(safeLocalStorage());

type ListableStorage = KeyValueStorage & Partial<Pick<Storage, "key" | "length">>;

/**
 * "Borrar datos": resets every store in memory and removes every saved key of this game
 * (any `battleships.*` key, so data from other features is cleared too). Other sites' keys stay.
 */
export function clearAllData({
  storage = safeLocalStorage(),
  stores = [settingsStore, progressStore],
}: {
  storage?: ListableStorage | null;
  stores?: readonly { clear(): void }[];
} = {}): void {
  for (const store of stores) store.clear();
  if (!storage || typeof storage.key !== "function" || typeof storage.length !== "number") return;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(SAVE_PREFIX)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) removeSave(storage, key);
}
