import { describe, expect, it } from "vitest";
import { AI_DELAY_MS, createSettingsStore, DEFAULT_SETTINGS, SAVE_KEY } from "./settingsStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

describe("settings store", () => {
  it("starts from defaults when nothing is saved", () => {
    expect(createSettingsStore(memoryStorage()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists updates under a versioned schema and reloads them", () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.update({ vibration: false, mix: { ...DEFAULT_SETTINGS.mix, music: 0.2, muted: true } });
    const saved = JSON.parse(storage.data.get(SAVE_KEY) ?? "{}");
    expect(saved.version).toBe(1);
    const reloaded = createSettingsStore(storage).get();
    expect(reloaded.vibration).toBe(false);
    expect(reloaded.mix).toEqual({ ...DEFAULT_SETTINGS.mix, music: 0.2, muted: true });
  });

  it("notifies subscribers on update", () => {
    const store = createSettingsStore(memoryStorage());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.update({ showBlocked: true });
    expect(calls).toBe(1);
    expect(store.get().showBlocked).toBe(true);
  });

  it("falls back to defaults on corrupted data", () => {
    const storage = memoryStorage({ [SAVE_KEY]: "{not json" });
    expect(createSettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and defaults invalid ones", () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        settings: { vibration: false, motion: "warp", mix: { music: 7 } },
      }),
    });
    const settings = createSettingsStore(storage).get();
    expect(settings.vibration).toBe(false);
    expect(settings.motion).toBe(DEFAULT_SETTINGS.motion);
    expect(settings.mix).toEqual(DEFAULT_SETTINGS.mix);
  });

  it("migrates an unversioned save to the current schema", () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ vibration: false }) });
    expect(createSettingsStore(storage).get().vibration).toBe(false);
  });

  it("keeps working in memory when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createSettingsStore(broken);
    store.update({ vibration: false });
    expect(store.get().vibration).toBe(false);
  });

  it("defaults the AI options: easy, normal think delay and commander comments on", () => {
    const settings = createSettingsStore(memoryStorage()).get();
    expect(settings.lastDifficulty).toBe("easy");
    expect(settings.aiDelay).toBe("normal");
    expect(settings.commanderComments).toBe(true);
  });

  it("persists the last difficulty, AI delay and commander comments", () => {
    const storage = memoryStorage();
    createSettingsStore(storage).update({
      lastDifficulty: "hard",
      aiDelay: "fast",
      commanderComments: false,
    });
    const reloaded = createSettingsStore(storage).get();
    expect(reloaded.lastDifficulty).toBe("hard");
    expect(reloaded.aiDelay).toBe("fast");
    expect(reloaded.commanderComments).toBe(false);
  });

  it("loads an older v1 save without the AI fields, keeping its values", () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        settings: {
          mix: { music: 0.3, sfx: 0.8, ambient: 0.4, muted: false },
          ambientEnabled: true,
          vibration: false,
          motion: "full",
          showBlocked: true,
          confirmShot: "never",
        },
      }),
    });
    const settings = createSettingsStore(storage).get();
    expect(settings.vibration).toBe(false);
    expect(settings.confirmShot).toBe("never");
    expect(settings.mix.music).toBeCloseTo(0.3);
    expect(settings.lastDifficulty).toBe("easy");
    expect(settings.aiDelay).toBe("normal");
    expect(settings.commanderComments).toBe(true);
  });

  it("rejects an unknown difficulty or delay field by field", () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 1,
        settings: { lastDifficulty: "nightmare", aiDelay: "instant", commanderComments: false },
      }),
    });
    const settings = createSettingsStore(storage).get();
    expect(settings.lastDifficulty).toBe("easy");
    expect(settings.aiDelay).toBe("normal");
    expect(settings.commanderComments).toBe(false);
  });

  it("maps the AI delay setting to think-delay ranges, fast being shorter", () => {
    expect(AI_DELAY_MS.normal).toEqual({ min: 400, max: 900 });
    expect(AI_DELAY_MS.fast).toEqual({ min: 150, max: 300 });
  });

  it("clears saved data back to defaults", () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.update({ vibration: false });
    store.clear();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });
});
