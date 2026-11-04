import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioEngine,
  DEFAULT_MIX,
  layerGainsFor,
  type MusicIntensity,
  SFX_IDS,
} from "./audioEngine";
import {
  FakeAudioContext,
  FakeBufferSource,
  FakeGain,
  type FakeNode,
  FakeOscillator,
  isSource,
  reaches,
} from "./fakeAudioContext";

const DISTINCT_MIX = { music: 0.25, sfx: 0.5, ambient: 0.75, muted: false };

function setup() {
  const ctx = new FakeAudioContext();
  const factory = vi.fn(() => ctx.asAudioContext());
  const engine = new AudioEngine(factory);
  return { ctx, factory, engine };
}

function gains(ctx: FakeAudioContext): FakeGain[] {
  return ctx.nodes.filter((n): n is FakeGain => n instanceof FakeGain);
}

/** Buses are identified by the distinctive volumes set through setMix. */
function buses(ctx: FakeAudioContext) {
  const all = gains(ctx);
  const byValue = (v: number) => {
    const found = all.find((g) => g.gain.value === v);
    if (!found) throw new Error(`no gain with value ${v}`);
    return found;
  };
  const music = byValue(DISTINCT_MIX.music);
  const sfx = byValue(DISTINCT_MIX.sfx);
  const ambient = byValue(DISTINCT_MIX.ambient);
  const master = music.connections[0];
  if (!(master instanceof FakeGain)) throw new Error("music bus is not connected to a master gain");
  return { master, music, sfx, ambient };
}

async function unlocked() {
  const s = setup();
  s.engine.setMix(DISTINCT_MIX);
  await s.engine.unlock();
  return { ...s, bus: buses(s.ctx) };
}

function newNodes(ctx: FakeAudioContext, before: number): FakeNode[] {
  return ctx.nodes.slice(before);
}

function layerGainNodes(ctx: FakeAudioContext, musicBus: FakeGain): FakeGain[] {
  return gains(ctx).filter((g) => g !== musicBus && g.connections.includes(musicBus));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AudioEngine before unlock", () => {
  it("creates no AudioContext until unlock is called", () => {
    const { factory, engine } = setup();
    engine.setMix({ ...DEFAULT_MIX, muted: true });
    engine.play("fire");
    engine.startMusic();
    engine.setIntensity(2);
    engine.setAmbient(true);
    expect(factory).not.toHaveBeenCalled();
    expect(engine.unlocked).toBe(false);
  });

  it("treats play, music and intensity as silent no-ops", () => {
    const { ctx, engine } = setup();
    for (const id of SFX_IDS) expect(() => engine.play(id)).not.toThrow();
    engine.startMusic();
    expect(ctx.nodes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("AudioEngine.unlock", () => {
  it("creates and resumes the context once, even when called repeatedly", async () => {
    const { ctx, factory, engine } = setup();
    await Promise.all([engine.unlock(), engine.unlock()]);
    await engine.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.unlocked).toBe(true);
  });

  it("resolves with unlocked=false when Web Audio is unavailable", async () => {
    const engine = new AudioEngine(() => {
      throw new Error("no audio");
    });
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(engine.unlocked).toBe(false);
    expect(() => engine.play("hit")).not.toThrow();
    expect(() => engine.startMusic()).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
  });

  it("resolves with unlocked=false when the default factory finds no AudioContext", async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    expect(engine.unlocked).toBe(false);
  });

  it("routes master through the destination", async () => {
    const { ctx, bus } = await unlocked();
    expect(reaches(bus.master, ctx.destination)).toBe(true);
    for (const b of [bus.music, bus.sfx, bus.ambient]) expect(b.connections).toContain(bus.master);
  });
});

describe("AudioEngine.play", () => {
  it.each(SFX_IDS)("synthesizes %s into the sfx bus only", async (id) => {
    const { ctx, engine, bus } = await unlocked();
    const before = ctx.nodes.length;
    engine.play(id);
    const sources = newNodes(ctx, before).filter(isSource);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.starts.length).toBe(1);
      expect(s.stops.length).toBe(1);
      expect(s.onended).toBeTypeOf("function");
      expect(reaches(s, bus.sfx)).toBe(true);
      expect(reaches(s, bus.music)).toBe(false);
    }
  });

  it("gives every sound a distinct synthesis recipe", async () => {
    const { ctx, engine } = await unlocked();
    const signatures = new Set<string>();
    for (const id of SFX_IDS) {
      const before = ctx.nodes.length;
      engine.play(id);
      const recipe = newNodes(ctx, before).map((n) =>
        n instanceof FakeOscillator
          ? `${n.type}:${n.frequency.calls[0]?.args[0] ?? n.frequency.value}`
          : n.kind,
      );
      signatures.add(recipe.join("|"));
    }
    expect(signatures.size).toBe(SFX_IDS.length);
  });

  it("reuses one white-noise buffer across all sounds", async () => {
    const { ctx, engine } = await unlocked();
    for (const id of SFX_IDS) engine.play(id);
    engine.play("hit");
    expect(ctx.buffersCreated).toBe(1);
    const buffers = new Set(
      ctx.nodes.filter((n) => n instanceof FakeBufferSource).map((n) => n.buffer),
    );
    expect(buffers.size).toBe(1);
  });

  it("disconnects one-shot nodes when they end", async () => {
    const { ctx, engine } = await unlocked();
    const before = ctx.nodes.length;
    engine.play("hit");
    const created = newNodes(ctx, before);
    for (const s of created.filter(isSource)) s.onended?.();
    expect(created.every((n) => n.disconnected)).toBe(true);
  });
});

describe("AudioEngine.setMix", () => {
  it("maps volumes to bus gains and muted to master 0", async () => {
    const { engine, bus } = await unlocked();
    expect(bus.master.gain.value).toBe(1);
    engine.setMix({ music: 0.1, sfx: 0.2, ambient: 0.3, muted: true });
    expect(bus.music.gain.value).toBeCloseTo(0.1);
    expect(bus.sfx.gain.value).toBeCloseTo(0.2);
    expect(bus.ambient.gain.value).toBeCloseTo(0.3);
    expect(bus.master.gain.value).toBe(0);
    engine.setMix({ music: 0.1, sfx: 0.2, ambient: 0.3, muted: false });
    expect(bus.master.gain.value).toBe(1);
  });

  it("applies a mix stored before unlock, including mute", async () => {
    const { ctx, engine } = setup();
    engine.setMix({ ...DISTINCT_MIX, muted: true });
    await engine.unlock();
    const bus = buses(ctx);
    expect(bus.master.gain.value).toBe(0);
    expect(bus.sfx.gain.value).toBe(DISTINCT_MIX.sfx);
  });

  it("clamps volumes into 0..1", async () => {
    const { engine, bus } = await unlocked();
    engine.setMix({ music: 1.7, sfx: -2, ambient: Number.NaN, muted: false });
    expect(bus.music.gain.value).toBe(1);
    expect(bus.sfx.gain.value).toBe(0);
    expect(bus.ambient.gain.value).toBe(0);
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_MIX).toEqual({ music: 0.5, sfx: 0.8, ambient: 0.4, muted: false });
  });
});

describe("layerGainsFor", () => {
  const levels: MusicIntensity[] = [0, 1, 2, 3];

  it("keeps only the base layer audible at intensity 0", () => {
    const [base, ...rest] = layerGainsFor(0);
    expect(base).toBeGreaterThan(0);
    expect(rest.every((g) => g === 0)).toBe(true);
  });

  it("never removes a layer as intensity rises and always adds one", () => {
    const active = (l: MusicIntensity) => layerGainsFor(l).map((g) => g > 0);
    for (const level of levels.slice(0, -1)) {
      const now = active(level);
      const next = active((level + 1) as MusicIntensity);
      now.forEach((on, i) => {
        if (on) expect(next[i]).toBe(true);
      });
      expect(next.filter(Boolean).length).toBeGreaterThan(now.filter(Boolean).length);
    }
  });

  it("returns one gain per layer within 0..1", () => {
    for (const level of levels) {
      const g = layerGainsFor(level);
      expect(g).toHaveLength(4);
      expect(g.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });
});

describe("AudioEngine music", () => {
  it("starts four layers at intensity 0 and schedules notes ahead", async () => {
    const { ctx, engine, bus } = await unlocked();
    engine.startMusic();
    const layers = layerGainNodes(ctx, bus.music);
    expect(layers).toHaveLength(4);
    expect(layers.map((l) => l.gain.value)).toEqual([...layerGainsFor(0)]);
    expect(vi.getTimerCount()).toBe(1);
    engine.setIntensity(3);
    const before = ctx.nodes.length;
    ctx.currentTime = 2;
    vi.advanceTimersByTime(100);
    const scheduled = newNodes(ctx, before).filter(isSource);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every((s) => reaches(s, bus.music))).toBe(true);
    expect(scheduled.every((s) => (s.starts[0] ?? 0) >= 2)).toBe(true);
  });

  it("fades layers with ramps instead of abrupt cuts", async () => {
    const { ctx, engine, bus } = await unlocked();
    engine.startMusic();
    ctx.currentTime = 4;
    const layers = layerGainNodes(ctx, bus.music);
    for (const l of layers) l.gain.calls.length = 0;
    engine.setIntensity(3);
    const targets = layerGainsFor(3);
    layers.forEach((layer, i) => {
      const ramp = layer.gain.calls.find(
        (c) => c.method === "linearRampToValueAtTime" || c.method === "setTargetAtTime",
      );
      expect(ramp?.args[0]).toBe(targets[i]);
      expect(ramp?.args[1]).toBeGreaterThan(4);
    });
  });

  it("stops the scheduler when music stops", async () => {
    const { engine } = await unlocked();
    engine.startMusic();
    engine.stopMusic(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("AudioEngine ambient", () => {
  it("plays a looping noise bed into the ambient bus", async () => {
    const { ctx, engine, bus } = await unlocked();
    const before = ctx.nodes.length;
    engine.setAmbient(true);
    const bed = newNodes(ctx, before).find(
      (n): n is FakeBufferSource => n instanceof FakeBufferSource,
    );
    expect(bed?.loop).toBe(true);
    expect(bed && reaches(bed, bus.ambient)).toBe(true);
    engine.setAmbient(false);
    expect(bed?.stops.length).toBe(1);
  });

  it("starts an ambient bed requested before unlock", async () => {
    const { ctx, engine } = setup();
    engine.setMix(DISTINCT_MIX);
    engine.setAmbient(true);
    await engine.unlock();
    const bus = buses(ctx);
    const loops = ctx.nodes.filter((n) => n instanceof FakeBufferSource && n.loop);
    expect(loops.some((n) => reaches(n, bus.ambient))).toBe(true);
  });
});

describe("AudioEngine lifecycle", () => {
  it("suspends and resumes the context", async () => {
    const { ctx, engine } = await unlocked();
    engine.suspend();
    expect(ctx.suspendCalls).toBe(1);
    engine.resume();
    expect(ctx.resumeCalls).toBe(2);
  });

  it("dispose clears the scheduler and closes the context", async () => {
    const { ctx, engine } = await unlocked();
    engine.startMusic();
    engine.setAmbient(true);
    expect(vi.getTimerCount()).toBe(1);
    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.closeCalls).toBe(1);
    expect(engine.unlocked).toBe(false);
    expect(() => engine.play("click")).not.toThrow();
    await engine.unlock();
    expect(engine.unlocked).toBe(false);
  });
});
