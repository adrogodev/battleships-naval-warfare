import type { AudioEngine, AudioMix, MusicIntensity, SfxId } from "./audioEngine";

/** What the app needs from the audio engine; the engine and the lazy facade both provide it. */
export type GameAudio = Pick<
  AudioEngine,
  "unlock" | "setMix" | "play" | "startMusic" | "setIntensity" | "setAmbient" | "suspend" | "resume"
>;

const loadEngine = async (): Promise<GameAudio> => {
  const { AudioEngine } = await import("./audioEngine");
  return new AudioEngine();
};

/**
 * Keeps the audio engine out of the initial bundle: it is fetched on first use (the menu
 * mounts it right away) and the latest mix, ambient, intensity and suspension are replayed
 * once it arrives. Sounds requested before that are dropped: audio is locked until the
 * boot tap anyway. A failed fetch leaves the game silent, never broken.
 */
export class LazyAudio implements GameAudio {
  private engine: GameAudio | null = null;
  private loading: Promise<GameAudio | null> | null = null;
  private mix: AudioMix | null = null;
  private ambient: boolean | null = null;
  private intensity: MusicIntensity | null = null;
  private suspended = false;

  constructor(private readonly load: () => Promise<GameAudio> = loadEngine) {}

  private ensure(): Promise<GameAudio | null> {
    this.loading ??= this.load().then(
      (engine) => {
        if (this.mix) engine.setMix(this.mix);
        if (this.ambient !== null) engine.setAmbient(this.ambient);
        if (this.intensity !== null) engine.setIntensity(this.intensity);
        if (this.suspended) engine.suspend();
        this.engine = engine;
        return engine;
      },
      () => null,
    );
    return this.loading;
  }

  async unlock(): Promise<void> {
    const engine = await this.ensure();
    await engine?.unlock();
  }

  setMix(mix: AudioMix): void {
    this.mix = mix;
    if (this.engine) this.engine.setMix(mix);
    else void this.ensure();
  }

  setAmbient(enabled: boolean): void {
    this.ambient = enabled;
    if (this.engine) this.engine.setAmbient(enabled);
    else void this.ensure();
  }

  setIntensity(level: MusicIntensity): void {
    this.intensity = level;
    this.engine?.setIntensity(level);
  }

  play(id: SfxId): void {
    this.engine?.play(id);
  }

  startMusic(): void {
    this.engine?.startMusic();
  }

  suspend(): void {
    this.suspended = true;
    this.engine?.suspend();
  }

  resume(): void {
    this.suspended = false;
    this.engine?.resume();
  }
}
