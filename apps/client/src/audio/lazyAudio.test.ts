import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MIX } from "./audioEngine";
import { type GameAudio, LazyAudio } from "./lazyAudio";

function fakeEngine() {
  return {
    unlock: vi.fn(() => Promise.resolve()),
    setMix: vi.fn(),
    play: vi.fn(),
    startMusic: vi.fn(),
    setIntensity: vi.fn(),
    setAmbient: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
  } satisfies GameAudio;
}

describe("LazyAudio", () => {
  it("does not load the engine until it is first used", () => {
    const load = vi.fn(() => Promise.resolve(fakeEngine()));
    new LazyAudio(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads the engine once and unlocks it", async () => {
    const engine = fakeEngine();
    const load = vi.fn(() => Promise.resolve(engine));
    const audio = new LazyAudio(load);
    await audio.unlock();
    await audio.unlock();
    expect(load).toHaveBeenCalledTimes(1);
    expect(engine.unlock).toHaveBeenCalledTimes(2);
  });

  it("applies the latest mix, ambient, intensity and suspension once the engine arrives", async () => {
    const engine = fakeEngine();
    const audio = new LazyAudio(() => Promise.resolve(engine));
    const quiet = { ...DEFAULT_MIX, music: 0.1 };
    audio.setMix(DEFAULT_MIX);
    audio.setMix(quiet);
    audio.setAmbient(false);
    audio.setIntensity(2);
    audio.suspend();
    await audio.unlock();
    expect(engine.setMix).toHaveBeenCalledTimes(1);
    expect(engine.setMix).toHaveBeenCalledWith(quiet);
    expect(engine.setAmbient).toHaveBeenCalledWith(false);
    expect(engine.setIntensity).toHaveBeenCalledWith(2);
    expect(engine.suspend).toHaveBeenCalledTimes(1);
  });

  it("drops sounds played before the engine loads and forwards them afterwards", async () => {
    const engine = fakeEngine();
    const audio = new LazyAudio(() => Promise.resolve(engine));
    audio.play("click");
    await audio.unlock();
    audio.play("hit");
    audio.startMusic();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledWith("hit");
    expect(engine.startMusic).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the engine fails to load", async () => {
    const audio = new LazyAudio(() => Promise.reject(new Error("chunk failed")));
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => audio.play("click")).not.toThrow();
  });
});
