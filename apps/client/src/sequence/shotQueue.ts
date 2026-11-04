import type { LogEntry } from "../adapters/localAiGame";
import type { MotionTokens } from "../theme/motion";

/**
 * fire: cannon + shake (own shots only) · suspense: projectile in flight ·
 * impact: the cell result appears · sunk: silhouette revealed after a dramatic pause · done.
 */
export type ShotPhase = "fire" | "suspense" | "impact" | "sunk" | "done";

export interface ShotStep {
  readonly phase: ShotPhase;
  readonly at: number;
}

/** Timeline of one shot, all durations taken from the motion tokens. */
export function planShot(entry: LogEntry, motion: MotionTokens): ShotStep[] {
  const steps: ShotStep[] = [];
  let impactAt: number;
  if (entry.seat === 0) {
    steps.push({ phase: "fire", at: 0 }, { phase: "suspense", at: motion.fireMs });
    impactAt = motion.fireMs + motion.suspenseMs;
  } else {
    steps.push({ phase: "suspense", at: 0 });
    impactAt = motion.enemyShotMs;
  }
  steps.push({ phase: "impact", at: impactAt });
  let endAt = impactAt + motion.resultMs;
  if (entry.result === "sunk") {
    const sunkAt = impactAt + motion.sinkPauseMs;
    steps.push({ phase: "sunk", at: sunkAt });
    endAt = sunkAt + motion.resultMs;
  }
  steps.push({ phase: "done", at: endAt });
  return steps;
}

export interface ShotQueueSnapshot {
  /** Number of log entries whose result is visible on the boards. */
  readonly impacted: number;
  /** Log indexes of sinkings whose silhouette has been revealed. */
  readonly sunkRevealed: ReadonlySet<number>;
  readonly active: { readonly entry: LogEntry; readonly phase: ShotPhase } | null;
  /** True while any shot is still playing; the player cannot fire meanwhile. */
  readonly busy: boolean;
}

interface ShotQueueOptions {
  motion: () => MotionTokens;
  onPhase?: (entry: LogEntry, phase: ShotPhase) => void;
}

/**
 * Presents game log entries as timed sequences, one at a time. The game state is already
 * resolved; this only decides when each result becomes visible, audible and announced.
 */
export class ShotQueue {
  private readonly options: ShotQueueOptions;
  private queued = 0;
  private pending: LogEntry[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot: ShotQueueSnapshot = {
    impacted: 0,
    sunkRevealed: new Set(),
    active: null,
    busy: false,
  };

  constructor(options: ShotQueueOptions) {
    this.options = options;
  }

  getSnapshot = (): ShotQueueSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Enqueues entries not seen yet. Safe to call with the full log on every render. */
  sync(log: readonly LogEntry[]): void {
    if (log.length <= this.queued) return;
    this.pending.push(...log.slice(this.queued));
    this.queued = log.length;
    if (!this.snapshot.active) this.playNext();
  }

  /** Reveals everything immediately (e.g. leaving the battle). */
  skipAll(): void {
    this.clearTimers();
    const sunk = new Set(this.snapshot.sunkRevealed);
    const remaining = this.snapshot.active
      ? [this.snapshot.active.entry, ...this.pending]
      : this.pending;
    for (const entry of remaining) if (entry.result === "sunk") sunk.add(entry.id);
    this.pending = [];
    this.set({ impacted: this.queued, sunkRevealed: sunk, active: null, busy: false });
  }

  dispose(): void {
    this.clearTimers();
    this.pending = [];
    this.listeners.clear();
  }

  private playNext(): void {
    const entry = this.pending.shift();
    if (!entry) {
      this.set({ ...this.snapshot, active: null, busy: false });
      return;
    }
    for (const step of planShot(entry, this.options.motion())) {
      const run = () => this.enter(entry, step.phase);
      if (step.at === 0) run();
      else this.timers.push(setTimeout(run, step.at));
    }
  }

  private enter(entry: LogEntry, phase: ShotPhase): void {
    let { impacted, sunkRevealed } = this.snapshot;
    if (phase === "impact") impacted = entry.id + 1;
    if (phase === "sunk") sunkRevealed = new Set([...sunkRevealed, entry.id]);
    this.set({ impacted, sunkRevealed, active: { entry, phase }, busy: true });
    this.options.onPhase?.(entry, phase);
    if (phase === "done") {
      this.timers = [];
      this.playNext();
    }
  }

  private set(next: ShotQueueSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
