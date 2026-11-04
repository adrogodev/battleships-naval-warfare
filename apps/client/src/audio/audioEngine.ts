/**
 * Procedural Web Audio engine: every sound is synthesized at runtime from
 * oscillators, one shared white-noise buffer, filters and gain envelopes.
 * No audio files are loaded.
 *
 * Graph: sources -> (music | sfx | ambient) bus -> master -> limiter -> destination.
 * The AudioContext is only created by `unlock()`, which callers must invoke
 * from a user gesture (browsers block audio before the first interaction).
 */

export type SfxId =
  | "lock"
  | "fire"
  | "whistle"
  | "miss"
  | "hit"
  | "sunk"
  | "turn"
  | "victory"
  | "defeat"
  | "click"
  | "place";

export const SFX_IDS: readonly SfxId[] = [
  "lock",
  "fire",
  "whistle",
  "miss",
  "hit",
  "sunk",
  "turn",
  "victory",
  "defeat",
  "click",
  "place",
];

/** Volumes are 0..1; `muted` silences the master bus without losing the levels. */
export interface AudioMix {
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

export const DEFAULT_MIX: Readonly<AudioMix> = Object.freeze({
  music: 0.5,
  sfx: 0.8,
  ambient: 0.4,
  muted: false,
});

export type MusicIntensity = 0 | 1 | 2 | 3;

/** Layers: 0 pad/drone, 1 low pulse, 2 noise percussion, 3 hi-hats + arpeggio. */
const LAYER_GAINS: readonly (readonly number[])[] = [
  [1, 0, 0, 0],
  [1, 0.8, 0, 0],
  [0.9, 0.85, 0.7, 0],
  [0.8, 0.9, 0.8, 0.55],
];

const BASE_LAYER_GAINS: readonly number[] = [1, 0, 0, 0];

/** Pure: target gain for each music layer at the given intensity. */
export function layerGainsFor(intensity: MusicIntensity): readonly number[] {
  return LAYER_GAINS[intensity] ?? BASE_LAYER_GAINS;
}

const LAYER_FADE_S = 1.5;
const MIX_SMOOTHING_S = 0.02;
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const TEMPO_BPM = 92;
const STEP_S = 60 / TEMPO_BPM / 4; // sixteenth notes
const STEPS_PER_BAR = 16;
const NOISE_SECONDS = 2;
const SILENT = 0.0001;

/** D minor-ish progression, one root per bar (Hz). */
const BASS_ROOTS = [73.42, 73.42, 58.27, 65.41];
const ARP_NOTES = [293.66, 349.23, 440, 349.23];

type Ctx = AudioContext;

interface Buses {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ambient: GainNode;
}

interface MusicSession {
  layers: GainNode[];
  pad: OscillatorNode[];
  nextStepTime: number;
  step: number;
}

interface AmbientBed {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  nextRadioTime: number;
}

interface ToneSpec {
  type: OscillatorType;
  from: number;
  to?: number;
  at: number;
  dur: number;
  peak: number;
  attack?: number;
  detune?: number;
  filter?: FilterSpec;
}

interface NoiseSpec {
  at: number;
  dur: number;
  peak: number;
  filter: BiquadFilterType;
  freq: number;
  freqTo?: number;
  q?: number;
  attack?: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function defaultCreateContext(): Ctx {
  const g = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API is not available");
  return new Ctor();
}

export class AudioEngine {
  private readonly createContext: () => Ctx;
  private ctx: Ctx | null = null;
  private buses: Buses | null = null;
  private noise: AudioBuffer | null = null;
  private mix: AudioMix = { ...DEFAULT_MIX };
  private unlocking: Promise<void> | null = null;
  private isUnlocked = false;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private music: MusicSession | null = null;
  private intensity: MusicIntensity = 0;
  private ambientWanted = false;
  private ambient: AmbientBed | null = null;

  constructor(createContext: () => Ctx = defaultCreateContext) {
    this.createContext = createContext;
  }

  get unlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Creates (once) and resumes the AudioContext. Call only from a user gesture.
   * Never rejects: when Web Audio is unavailable `unlocked` simply stays false.
   */
  unlock(): Promise<void> {
    if (this.disposed || this.isUnlocked) return Promise.resolve();
    this.unlocking ??= this.doUnlock().finally(() => {
      this.unlocking = null;
    });
    return this.unlocking;
  }

  private async doUnlock(): Promise<void> {
    if (!this.ctx) {
      try {
        this.ctx = this.createContext();
      } catch {
        return;
      }
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // Some browsers reject resume outside a gesture; the next unlock retries.
        return;
      }
    }
    if (this.disposed) return;
    this.isUnlocked = true;
    if (this.ambientWanted) this.startAmbient();
  }

  private buildGraph(ctx: Ctx): void {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.connect(limiter);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    };
    this.buses = { master, music: bus(), sfx: bus(), ambient: bus() };
    const { music, sfx, ambient, muted } = this.mix;
    master.gain.value = muted ? 0 : 1;
    this.buses.music.gain.value = music;
    this.buses.sfx.gain.value = sfx;
    this.buses.ambient.gain.value = ambient;

    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMix(mix: AudioMix): void {
    this.mix = {
      music: clamp01(mix.music),
      sfx: clamp01(mix.sfx),
      ambient: clamp01(mix.ambient),
      muted: mix.muted,
    };
    const { ctx, buses } = this;
    if (!ctx || !buses) return;
    const now = ctx.currentTime;
    const apply = (param: AudioParam, v: number) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(v, now, MIX_SMOOTHING_S);
    };
    apply(buses.master.gain, this.mix.muted ? 0 : 1);
    apply(buses.music.gain, this.mix.music);
    apply(buses.sfx.gain, this.mix.sfx);
    apply(buses.ambient.gain, this.mix.ambient);
  }

  play(id: SfxId): void {
    const ready = this.ready();
    const voice = this.voice();
    if (!ready || !voice) return;
    SFX[id](voice, ready.ctx.currentTime + 0.005, ready.buses.sfx);
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    const ready = this.ready();
    if (!ready || this.music) return;
    const { ctx, buses } = ready;
    this.intensity = 0;
    const targets = layerGainsFor(0);
    const layers = targets.map((g) => {
      const node = ctx.createGain();
      node.gain.value = g;
      node.connect(buses.music);
      return node;
    });
    const padOut = layers[0] ?? buses.music;
    this.music = {
      layers,
      pad: this.startPad(ctx, padOut, layers),
      nextStepTime: ctx.currentTime + 0.05,
      step: 0,
    };
    this.ensureTimer();
  }

  /** Drone: two detuned saws + a fifth through a slowly breathing lowpass. */
  private startPad(ctx: Ctx, out: AudioNode, layers: GainNode[]): OscillatorNode[] {
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, t);
    env.gain.linearRampToValueAtTime(0.16, t + 3);
    filter.connect(env);
    env.connect(out);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);

    const voices = [
      { type: "sawtooth" as const, f: 73.42, d: -7 },
      { type: "sawtooth" as const, f: 73.42, d: 7 },
      { type: "triangle" as const, f: 110, d: 0 },
    ].map(({ type, f, d }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = d;
      osc.connect(filter);
      return osc;
    });
    const all = [...voices, lfo];
    for (const o of all) o.start(t);
    const last = voices[0];
    if (last) {
      last.onended = () => {
        for (const n of [...all, lfoDepth, filter, env, ...layers]) n.disconnect();
      };
    }
    return all;
  }

  stopMusic(fadeMs = 800): void {
    const session = this.music;
    if (!session) return;
    this.music = null;
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      const end = now + Math.max(0.01, fadeMs / 1000);
      for (const layer of session.layers) {
        layer.gain.cancelScheduledValues(now);
        layer.gain.setValueAtTime(layer.gain.value, now);
        layer.gain.linearRampToValueAtTime(0, end);
      }
      for (const osc of session.pad) safeStop(osc, end);
    }
    this.stopTimerIfIdle();
  }

  setIntensity(level: MusicIntensity): void {
    this.intensity = level;
    const session = this.music;
    const ctx = this.ctx;
    if (!session || !ctx) return;
    const now = ctx.currentTime;
    const targets = layerGainsFor(level);
    session.layers.forEach((layer, i) => {
      const param = layer.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(targets[i] ?? 0, now + LAYER_FADE_S);
    });
  }

  private scheduleMusic(ctx: Ctx, session: MusicSession): void {
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;
    // After a long stall (background tab), skip ahead instead of bursting notes.
    if (session.nextStepTime < ctx.currentTime - 0.2) session.nextStepTime = ctx.currentTime + 0.02;
    const targets = layerGainsFor(this.intensity);
    const voice = this.voice();
    if (!voice) return;
    while (session.nextStepTime < horizon) {
      scheduleStep(voice, session, session.nextStepTime, targets);
      session.nextStepTime += STEP_S;
      session.step = (session.step + 1) % (STEPS_PER_BAR * BASS_ROOTS.length);
    }
  }

  // -------------------------------------------------------------- ambient

  setAmbient(enabled: boolean): void {
    this.ambientWanted = enabled;
    if (enabled) this.startAmbient();
    else this.stopAmbient();
  }

  /** Sea/wind bed: looping noise, lowpass swept by a slow LFO, amplitude swell. */
  private startAmbient(): void {
    const ready = this.ready();
    if (!ready || this.ambient || !this.noise) return;
    const { ctx, buses } = ready;
    const t = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(SILENT, t);
    out.gain.linearRampToValueAtTime(0.5, t + 2);
    out.connect(buses.ambient);

    const bed = ctx.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.5;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    bed.connect(filter);
    filter.connect(swell);
    swell.connect(out);

    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.06;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth);
    sweepDepth.connect(filter.frequency);

    const wave = ctx.createOscillator();
    wave.frequency.value = 0.13;
    const waveDepth = ctx.createGain();
    waveDepth.gain.value = 0.3;
    wave.connect(waveDepth);
    waveDepth.connect(swell.gain);

    const sources = [bed, sweep, wave];
    for (const s of sources) s.start(t);
    bed.onended = () => {
      for (const n of [...sources, filter, swell, sweepDepth, waveDepth, out]) n.disconnect();
    };
    this.ambient = { out, sources, nextRadioTime: t + 4 + Math.random() * 6 };
    this.ensureTimer();
  }

  private stopAmbient(fadeS = 0.8): void {
    const bed = this.ambient;
    if (!bed) return;
    this.ambient = null;
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      bed.out.gain.cancelScheduledValues(now);
      bed.out.gain.setValueAtTime(bed.out.gain.value, now);
      bed.out.gain.linearRampToValueAtTime(0, now + fadeS);
      for (const s of bed.sources) safeStop(s, now + fadeS);
    }
    this.stopTimerIfIdle();
  }

  /** Occasional distant radio static: band-passed crackle plus a faint carrier. */
  private scheduleRadio(ctx: Ctx, bed: AmbientBed): void {
    const voice = this.voice();
    if (!voice || bed.nextRadioTime > ctx.currentTime + SCHEDULE_AHEAD_S) return;
    const t = Math.max(bed.nextRadioTime, ctx.currentTime);
    const dur = 0.15 + Math.random() * 0.3;
    voice.noise(bed.out, { at: t, dur, peak: 0.08, filter: "bandpass", freq: 2400, q: 6 });
    voice.tone(bed.out, { type: "sine", from: 1020, at: t + 0.02, dur: dur * 0.6, peak: 0.015 });
    bed.nextRadioTime = t + 6 + Math.random() * 9;
  }

  // ------------------------------------------------------------ scheduler

  private ensureTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.tick();
  }

  private stopTimerIfIdle(): void {
    if (this.timer === null || this.music || this.ambient) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (ctx?.state !== "running") return;
    if (this.music) this.scheduleMusic(ctx, this.music);
    if (this.ambient) this.scheduleRadio(ctx, this.ambient);
  }

  // ------------------------------------------------------------ lifecycle

  suspend(): void {
    this.ctx?.suspend().catch(() => undefined);
  }

  resume(): void {
    if (!this.isUnlocked) return;
    this.ctx?.resume().catch(() => undefined);
  }

  dispose(): void {
    this.disposed = true;
    this.isUnlocked = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.music = null;
    this.ambient = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.buses = null;
    this.noise = null;
    ctx?.close().catch(() => undefined);
  }

  // ----------------------------------------------------------- internals

  private ready(): { ctx: Ctx; buses: Buses } | null {
    if (!this.isUnlocked || !this.ctx || !this.buses) return null;
    return { ctx: this.ctx, buses: this.buses };
  }

  private voice(): Voice | null {
    const ctx = this.ctx;
    const noise = this.noise;
    if (!ctx || !noise) return null;
    return {
      tone: (out, spec) => tone(ctx, out, spec),
      noise: (out, spec) => noiseBurst(ctx, noise, out, spec),
    };
  }
}

interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** Synthesis primitives handed to the SFX recipes and the music scheduler. */
interface Voice {
  tone(out: AudioNode, spec: ToneSpec): void;
  noise(out: AudioNode, spec: NoiseSpec): void;
}

function envelope(ctx: Ctx, at: number, dur: number, peak: number, attack: number): GainNode {
  const env = ctx.createGain();
  const a = Math.min(attack, dur * 0.5);
  env.gain.setValueAtTime(SILENT, at);
  env.gain.linearRampToValueAtTime(peak, at + a);
  env.gain.exponentialRampToValueAtTime(SILENT, at + dur);
  return env;
}

/** One enveloped oscillator (optionally filtered); disconnects itself when it ends. */
function tone(ctx: Ctx, out: AudioNode, spec: ToneSpec): void {
  const { type, from, to, at, dur, peak, attack = 0.005, detune = 0, filter } = spec;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(from, at);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
  const env = envelope(ctx, at, dur, peak, attack);
  const nodes: AudioNode[] = [osc, env];
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 1;
    osc.connect(f);
    f.connect(env);
    nodes.push(f);
  } else {
    osc.connect(env);
  }
  env.connect(out);
  osc.onended = () => {
    for (const n of nodes) n.disconnect();
  };
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** One enveloped, filtered slice of the shared noise buffer; disconnects itself when it ends. */
function noiseBurst(ctx: Ctx, noise: AudioBuffer, out: AudioNode, spec: NoiseSpec): void {
  const { at, dur, peak, filter: type, freq, freqTo, q = 1, attack = 0.003 } = spec;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = dur > NOISE_SECONDS;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, at);
  if (freqTo !== undefined)
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), at + dur);
  const env = envelope(ctx, at, dur, peak, attack);
  src.connect(filter);
  filter.connect(env);
  env.connect(out);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    env.disconnect();
  };
  // Random offset so repeated bursts do not sound identical.
  const maxOffset = Math.max(0, NOISE_SECONDS - dur);
  src.start(at, Math.random() * maxOffset);
  src.stop(at + dur + 0.02);
}

function safeStop(node: AudioScheduledSourceNode, at: number): void {
  try {
    node.stop(at);
  } catch {
    // Already stopped.
  }
}

/** Schedules one sixteenth-note step of layers 1-3 (layer 0 is the continuous pad). */
function scheduleStep(
  voice: Voice,
  session: MusicSession,
  t: number,
  targets: readonly number[],
): void {
  const [, pulse, perc, top] = session.layers;
  const step = session.step;
  const inBar = step % STEPS_PER_BAR;
  const root = BASS_ROOTS[Math.floor(step / STEPS_PER_BAR)] ?? 73.42;
  // Layers still fading out keep playing; fully silent ones are skipped to save CPU.
  const audible = (i: number, node: GainNode | undefined): node is GainNode =>
    node !== undefined && ((targets[i] ?? 0) > 0 || node.gain.value > 0.001);

  if (audible(1, pulse) && inBar % 4 === 0) {
    voice.tone(pulse, {
      type: "triangle",
      from: root,
      at: t,
      dur: STEP_S * 3,
      peak: 0.5,
      attack: 0.01,
    });
    voice.tone(pulse, {
      type: "sine",
      from: root * 2,
      at: t,
      dur: STEP_S * 1.5,
      peak: 0.12,
      attack: 0.01,
    });
  }
  if (audible(2, perc)) {
    if (inBar === 0 || inBar === 8 || inBar === 10) {
      voice.tone(perc, {
        type: "sine",
        from: 130,
        to: 45,
        at: t,
        dur: 0.28,
        peak: 0.6,
        attack: 0.003,
      });
    }
    if (inBar === 4 || inBar === 12) {
      voice.noise(perc, { at: t, dur: 0.16, peak: 0.25, filter: "bandpass", freq: 1600, q: 0.8 });
    }
  }
  if (audible(3, top)) {
    voice.noise(top, {
      at: t,
      dur: 0.035,
      peak: inBar % 2 === 0 ? 0.12 : 0.06,
      filter: "highpass",
      freq: 7000,
    });
    if (inBar % 2 === 0) {
      const note = ARP_NOTES[(inBar / 2) % ARP_NOTES.length] ?? 293.66;
      voice.tone(top, {
        type: "triangle",
        from: note,
        at: t,
        dur: STEP_S * 1.6,
        peak: 0.07,
        attack: 0.005,
      });
    }
  }
}

type SfxRecipe = (v: Voice, t: number, out: AudioNode) => void;

const HULL_FILTER: FilterSpec = { type: "lowpass", freq: 650, q: 3 };
const DISTANT_FILTER: FilterSpec = { type: "lowpass", freq: 1200, q: 0.7 };

const SFX: Record<SfxId, SfxRecipe> = {
  // Soft, short high blip: target acquired.
  lock: (v, t, out) => {
    v.tone(out, {
      type: "sine",
      from: 1500,
      to: 1900,
      at: t,
      dur: 0.08,
      peak: 0.18,
      attack: 0.004,
    });
  },
  // Deep cannon thump: pitch-dropping sine body plus a short muffled noise blast.
  fire: (v, t, out) => {
    v.tone(out, { type: "sine", from: 140, to: 38, at: t, dur: 0.45, peak: 0.95, attack: 0.002 });
    v.noise(out, { at: t, dur: 0.14, peak: 0.6, filter: "lowpass", freq: 1100, freqTo: 250 });
  },
  // Falling-pitch projectile whistle.
  whistle: (v, t, out) => {
    v.tone(out, { type: "sine", from: 2300, to: 650, at: t, dur: 0.3, peak: 0.13, attack: 0.03 });
    v.tone(out, {
      type: "triangle",
      from: 2330,
      to: 660,
      at: t,
      dur: 0.3,
      peak: 0.04,
      attack: 0.03,
    });
  },
  // Water splash: band-passed noise sweeping down, plus a short spray hiss.
  miss: (v, t, out) => {
    v.noise(out, {
      at: t,
      dur: 0.65,
      peak: 0.45,
      filter: "bandpass",
      freq: 1400,
      freqTo: 350,
      q: 0.9,
    });
    v.noise(out, {
      at: t + 0.02,
      dur: 0.3,
      peak: 0.15,
      filter: "highpass",
      freq: 4000,
      attack: 0.01,
    });
  },
  // Explosion: low boom, broadband blast with a long rumbling tail.
  hit: (v, t, out) => {
    v.tone(out, { type: "sine", from: 95, to: 28, at: t, dur: 0.7, peak: 1, attack: 0.002 });
    v.noise(out, {
      at: t,
      dur: 1.2,
      peak: 0.85,
      filter: "lowpass",
      freq: 2200,
      freqTo: 160,
      q: 0.5,
    });
    v.noise(out, { at: t + 0.05, dur: 0.25, peak: 0.3, filter: "highpass", freq: 3000 });
  },
  // Hull cracking: detuned downward saws through a resonant lowpass, groaning noise, sub drop.
  sunk: (v, t, out) => {
    v.tone(out, {
      type: "sawtooth",
      from: 115,
      to: 38,
      at: t,
      dur: 1.2,
      peak: 0.35,
      attack: 0.02,
      filter: HULL_FILTER,
    });
    v.tone(out, {
      type: "sawtooth",
      from: 118.5,
      to: 36,
      at: t + 0.04,
      dur: 1.15,
      peak: 0.3,
      attack: 0.02,
      filter: HULL_FILTER,
    });
    v.noise(out, { at: t, dur: 1.2, peak: 0.4, filter: "bandpass", freq: 420, freqTo: 120, q: 2 });
    v.tone(out, { type: "sine", from: 60, to: 26, at: t + 0.1, dur: 1.1, peak: 0.6, attack: 0.05 });
  },
  // Two-tone alert: your turn.
  turn: (v, t, out) => {
    v.tone(out, { type: "square", from: 660, at: t, dur: 0.12, peak: 0.08, attack: 0.005 });
    v.tone(out, { type: "square", from: 880, at: t + 0.15, dur: 0.16, peak: 0.08, attack: 0.005 });
  },
  // Rising major fanfare (C E G C) resolving on a held chord.
  victory: (v, t, out) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      v.tone(out, {
        type: "triangle",
        from: f,
        at: t + i * 0.13,
        dur: last ? 0.9 : 0.16,
        peak: 0.22,
        attack: 0.01,
      });
    });
    v.tone(out, {
      type: "sawtooth",
      from: 783.99,
      at: t + 0.39,
      dur: 0.9,
      peak: 0.05,
      attack: 0.04,
    });
    v.tone(out, { type: "sine", from: 261.63, at: t + 0.39, dur: 0.9, peak: 0.2, attack: 0.04 });
  },
  // Sober descending low figure with a distant, muffled two-tone alarm.
  defeat: (v, t, out) => {
    [220, 174.61, 146.83].forEach((f, i) => {
      v.tone(out, {
        type: "triangle",
        from: f,
        at: t + i * 0.5,
        dur: 0.7,
        peak: 0.25,
        attack: 0.03,
      });
    });
    for (let i = 0; i < 3; i++) {
      const at = t + 0.2 + i * 0.6;
      v.tone(out, {
        type: "square",
        from: 620,
        at,
        dur: 0.25,
        peak: 0.025,
        attack: 0.02,
        filter: DISTANT_FILTER,
      });
      v.tone(out, {
        type: "square",
        from: 520,
        at: at + 0.3,
        dur: 0.25,
        peak: 0.025,
        attack: 0.02,
        filter: DISTANT_FILTER,
      });
    }
  },
  // Tiny UI tick.
  click: (v, t, out) => {
    v.tone(out, { type: "square", from: 2600, at: t, dur: 0.018, peak: 0.05, attack: 0.001 });
  },
  // Metallic clunk: low thud, inharmonic ring and a short contact click.
  place: (v, t, out) => {
    v.tone(out, { type: "sine", from: 180, to: 90, at: t, dur: 0.12, peak: 0.45, attack: 0.002 });
    v.tone(out, { type: "triangle", from: 1240, at: t, dur: 0.3, peak: 0.07, attack: 0.002 });
    v.tone(out, { type: "triangle", from: 1873, at: t, dur: 0.22, peak: 0.04, attack: 0.002 });
    v.noise(out, { at: t, dur: 0.03, peak: 0.25, filter: "bandpass", freq: 3200, q: 2 });
  },
};
