import { DIFFICULTIES } from "@battleships/shared";
import { z } from "zod";

export const SAVE_KEY = "battleships.settings";
const CURRENT_VERSION = 1;

const volume = z.number().min(0).max(1);

const settingsSchema = z.object({
  mix: z.object({ music: volume, sfx: volume, ambient: volume, muted: z.boolean() }),
  ambientEnabled: z.boolean(),
  vibration: z.boolean(),
  /** "system" follows prefers-reduced-motion. */
  motion: z.enum(["system", "reduced", "full"]),
  /** Shade cells the no-contact rule rules out around sunk ships. */
  showBlocked: z.boolean(),
  /** "auto" asks for confirmation on touch screens only. */
  confirmShot: z.enum(["auto", "always", "never"]),
  /** Difficulty of the last game started; preselected on the difficulty screen. */
  lastDifficulty: z.enum(DIFFICULTIES),
  /** AI "thinking" delay: see AI_DELAY_MS. */
  aiDelay: z.enum(["normal", "fast"]),
  /** The rival commander comments on key moments of the battle. */
  commanderComments: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  mix: { music: 0.5, sfx: 0.8, ambient: 0.4, muted: false },
  ambientEnabled: true,
  vibration: true,
  motion: "system",
  showBlocked: false,
  confirmShot: "auto",
  lastDifficulty: "easy",
  aiDelay: "normal",
  commanderComments: true,
};

/** Think-delay range (ms) for each AI delay setting. */
export const AI_DELAY_MS: Record<Settings["aiDelay"], { min: number; max: number }> = {
  normal: { min: 400, max: 900 },
  fast: { min: 150, max: 300 },
};

/** Minimal Storage surface so tests (and blocked storage) can stand in for localStorage. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A save as read from storage: `data` is the payload stored under the save's field. */
export type RawSave = { version: number; data: unknown };

/** Each entry upgrades a save from version N to N + 1. */
export type Migrations = Readonly<Record<number, (save: RawSave) => RawSave>>;

/** Where and how a versioned save lives: `{ version, [field]: payload }` under `key`. */
export interface SaveFormat {
  readonly key: string;
  readonly field: string;
  readonly version: number;
  readonly migrations: Migrations;
}

const SETTINGS_FORMAT: SaveFormat = {
  key: SAVE_KEY,
  field: "settings",
  version: CURRENT_VERSION,
  migrations: {
    // v0: unversioned object holding the settings fields directly.
    0: (save) => ({ version: 1, data: save.data }),
  },
};

function migrate(raw: unknown, format: SaveFormat): unknown {
  if (raw === null || typeof raw !== "object") return undefined;
  let save: RawSave =
    "version" in raw && typeof raw.version === "number"
      ? { version: raw.version, data: (raw as Record<string, unknown>)[format.field] }
      : { version: 0, data: raw };
  while (save.version < format.version) {
    const step = format.migrations[save.version];
    if (!step) return undefined;
    save = step(save);
  }
  return save.data;
}

/** Reads and migrates a versioned save; undefined when missing, corrupted or unreadable. */
export function readSave(storage: KeyValueStorage | null, format: SaveFormat): unknown {
  try {
    const text = storage?.getItem(format.key);
    return text ? migrate(JSON.parse(text), format) : undefined;
  } catch {
    return undefined;
  }
}

export function writeSave(
  storage: KeyValueStorage | null,
  format: SaveFormat,
  data: unknown,
): void {
  try {
    storage?.setItem(format.key, JSON.stringify({ version: format.version, [format.field]: data }));
  } catch {
    // Private mode or blocked storage: the data keeps working for this session.
  }
}

export function removeSave(storage: KeyValueStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage unavailable: memory state is still reset.
  }
}

/** Field-by-field recovery: a bad field falls back to its default without losing the others. */
function sanitize(input: unknown): Settings {
  if (input === null || typeof input !== "object") return DEFAULT_SETTINGS;
  const record = input as Record<string, unknown>;
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(settingsSchema.shape) as (keyof Settings)[]) {
    const parsed = settingsSchema.shape[key].safeParse(record[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return settingsSchema.parse(result);
}

export interface SettingsStore {
  get(): Settings;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<Settings>): void;
  clear(): void;
}

export function createSettingsStore(storage: KeyValueStorage | null): SettingsStore {
  let current = load(storage);
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
    update(patch) {
      current = sanitize({ ...current, ...patch });
      writeSave(storage, SETTINGS_FORMAT, current);
      emit();
    },
    clear() {
      current = DEFAULT_SETTINGS;
      removeSave(storage, SAVE_KEY);
      emit();
    },
  };
}

function load(storage: KeyValueStorage | null): Settings {
  const raw = readSave(storage, SETTINGS_FORMAT);
  return raw === undefined ? DEFAULT_SETTINGS : sanitize(raw);
}

/** localStorage, or null where it is missing or blocked (private mode, sandboxed frames). */
export function safeLocalStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** App-wide instance backed by localStorage. */
export const settingsStore = createSettingsStore(safeLocalStorage());
