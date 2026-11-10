import { describe, expect, it } from "vitest";
import { createSettingsStore, DEFAULT_SETTINGS, SAVE_KEY } from "../settings/settingsStore";
import { EMPTY_PROGRESS } from "./progress";
import { clearAllData, createProgressStore, PROGRESS_KEY } from "./progressStore";
import { gameRecord } from "./testing";

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
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
    data,
  };
}

describe("progress store", () => {
  it("starts empty when nothing is saved", () => {
    expect(createProgressStore(memoryStorage()).get()).toEqual(EMPTY_PROGRESS);
  });

  it("saves a recorded game under a versioned schema and reloads it", () => {
    const storage = memoryStorage();
    const report = createProgressStore(storage).recordGame(gameRecord({ id: "a" }));
    expect(report?.xp.total).toBeGreaterThan(0);
    const saved = JSON.parse(storage.data.get(PROGRESS_KEY) ?? "{}");
    expect(saved.version).toBe(1);
    expect(saved.progress.games).toBe(1);
    const reloaded = createProgressStore(storage).get();
    expect(reloaded.games).toBe(1);
    expect(reloaded.xp).toBe(report?.xp.total);
  });

  it("does not count the same game twice, even after a reload", () => {
    const storage = memoryStorage();
    createProgressStore(storage).recordGame(gameRecord({ id: "same" }));
    const again = createProgressStore(storage).recordGame(gameRecord({ id: "same" }));
    expect(again).toBeNull();
    expect(createProgressStore(storage).get().games).toBe(1);
  });

  it("notifies subscribers when a game is recorded", () => {
    const store = createProgressStore(memoryStorage());
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.recordGame(gameRecord());
    expect(calls).toBe(1);
  });

  it("falls back to empty progress on corrupted data", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: "{not json" });
    expect(createProgressStore(storage).get()).toEqual(EMPTY_PROGRESS);
  });

  it("keeps valid fields and resets invalid ones", () => {
    const storage = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({
        version: 1,
        progress: { xp: 300, games: -4, heatmap: [1, 2], completed: ["first-victory", "nope"] },
      }),
    });
    const progress = createProgressStore(storage).get();
    expect(progress.xp).toBe(300);
    expect(progress.games).toBe(EMPTY_PROGRESS.games);
    expect(progress.heatmap).toEqual(EMPTY_PROGRESS.heatmap);
    expect(progress.completed).toEqual(["first-victory"]);
  });

  it("migrates an unversioned save to the current schema", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ xp: 120, games: 2 }) });
    const progress = createProgressStore(storage).get();
    expect(progress.xp).toBe(120);
    expect(progress.games).toBe(2);
  });

  it("keeps working in memory when storage throws", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    const store = createProgressStore({ getItem: fail, setItem: fail, removeItem: fail });
    store.recordGame(gameRecord());
    expect(store.get().games).toBe(1);
  });

  it("clears the saved progress", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    store.recordGame(gameRecord());
    store.clear();
    expect(store.get()).toEqual(EMPTY_PROGRESS);
    expect(storage.data.has(PROGRESS_KEY)).toBe(false);
  });
});

describe("delete all data", () => {
  it("clears settings, progress and any other saved game key, but nothing else", () => {
    const storage = memoryStorage({
      "battleships.tutorial": "done",
      "other-app": "keep",
    });
    const settings = createSettingsStore(storage);
    const progress = createProgressStore(storage);
    settings.update({ vibration: false });
    progress.recordGame(gameRecord());

    clearAllData({ storage, stores: [settings, progress] });

    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(progress.get()).toEqual(EMPTY_PROGRESS);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(storage.data.has(PROGRESS_KEY)).toBe(false);
    expect(storage.data.has("battleships.tutorial")).toBe(false);
    expect(storage.data.get("other-app")).toBe("keep");
  });
});
