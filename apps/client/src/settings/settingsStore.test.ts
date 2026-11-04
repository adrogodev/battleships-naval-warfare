import { describe, expect, it } from "vitest";
import { createSettingsStore, DEFAULT_SETTINGS, SAVE_KEY } from "./settingsStore";

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

  it("clears saved data back to defaults", () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.update({ vibration: false });
    store.clear();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });
});
