/**
 * Motion tokens: every duration of the game. The shot sequencer reads them in JS and
 * applyMotionTokens mirrors them into CSS variables so CSS animations stay in sync.
 */
export interface MotionTokens {
  /** Fire: instant button response, cannon sound, panel shake (0–150 ms). */
  readonly fireMs: number;
  /** Suspense: projectile in flight (150–450 ms). */
  readonly suspenseMs: number;
  /** Result: splash, explosion or hit flash (450–700 ms). */
  readonly resultMs: number;
  /** Extra dramatic pause before a sunk ship is revealed. */
  readonly sinkPauseMs: number;
  /** Incoming enemy shot (shorter: the player is only watching). */
  readonly enemyShotMs: number;
  readonly shakeMs: number;
  readonly pulseMs: number;
  readonly sweepMs: number;
  readonly screenMs: number;
  /** Banner shown before the results screen. */
  readonly finaleMs: number;
}

export const MOTION: MotionTokens = {
  fireMs: 150,
  suspenseMs: 300,
  resultMs: 250,
  sinkPauseMs: 300,
  enemyShotMs: 450,
  shakeMs: 150,
  pulseMs: 1200,
  sweepMs: 6000,
  screenMs: 240,
  finaleMs: 1600,
};

/** Reduced motion: a full own shot (even a sinking one) stays under 200 ms. */
export const REDUCED_MOTION: MotionTokens = {
  fireMs: 40,
  suspenseMs: 60,
  resultMs: 60,
  sinkPauseMs: 30,
  enemyShotMs: 120,
  shakeMs: 0,
  pulseMs: 0,
  sweepMs: 0,
  screenMs: 0,
  finaleMs: 400,
};

export function motionTokens(reduced: boolean): MotionTokens {
  return reduced ? REDUCED_MOTION : MOTION;
}

export function applyMotionTokens(tokens: MotionTokens, root: HTMLElement): void {
  const toCss: Record<string, number> = {
    "--dur-fire": tokens.fireMs,
    "--dur-suspense": tokens.suspenseMs,
    "--dur-result": tokens.resultMs,
    "--dur-shake": tokens.shakeMs,
    "--dur-pulse": tokens.pulseMs,
    "--dur-sweep": tokens.sweepMs,
    "--dur-screen": tokens.screenMs,
  };
  for (const [name, ms] of Object.entries(toCss)) root.style.setProperty(name, `${ms}ms`);
}
