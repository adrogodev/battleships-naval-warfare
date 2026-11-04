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
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  mix: { music: 0.5, sfx: 0.8, ambient: 0.4, muted: false },
  ambientEnabled: true,
  vibration: true,
  motion: "system",
  showBlocked: false,
  confirmShot: "auto",
};

/** Minimal Storage surface so tests (and blocked storage) can stand in for localStorage. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type RawSave = { version: number; settings: unknown };

/** Each entry upgrades a save from version N to N + 1. */
const MIGRATIONS: Record<number, (data: RawSave) => RawSave> = {
  // v0: unversioned object holding the settings fields directly.
  0: (data) => ({ version: 1, settings: data.settings }),
};

function migrate(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return undefined;
  let save: RawSave =
    "version" in raw && typeof raw.version === "number"
      ? { version: raw.version, settings: "settings" in raw ? raw.settings : undefined }
      : { version: 0, settings: raw };
  while (save.version < CURRENT_VERSION) {
    const step = MIGRATIONS[save.version];
    if (!step) return undefined;
    save = step(save);
  }
  return save.settings;
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
      save(storage, current);
      emit();
    },
    clear() {
      current = DEFAULT_SETTINGS;
      try {
        storage?.removeItem(SAVE_KEY);
      } catch {
        // Storage unavailable: memory state is still reset.
      }
      emit();
    },
  };
}

function load(storage: KeyValueStorage | null): Settings {
  try {
    const text = storage?.getItem(SAVE_KEY);
    return text ? sanitize(migrate(JSON.parse(text))) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(storage: KeyValueStorage | null, settings: Settings): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify({ version: CURRENT_VERSION, settings }));
  } catch {
    // Private mode or blocked storage: settings keep working for this session.
  }
}

function safeLocalStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** App-wide instance backed by localStorage. */
export const settingsStore = createSettingsStore(safeLocalStorage());
