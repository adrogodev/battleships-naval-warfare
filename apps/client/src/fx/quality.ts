/**
 * Adaptive render quality for the animated ocean: drop fast when frames are slow,
 * raise only after a sustained good stretch so the level never oscillates.
 */

export type QualityLevel = "high" | "medium" | "low";

const LEVELS: readonly QualityLevel[] = ["low", "medium", "high"];

/** Frames needed before a drop can be judged (~0.5 s at 60 fps). */
export const DROP_WINDOW = 30;
/** Frames needed before a raise can be judged (~2 s at 60 fps). */
export const RAISE_WINDOW = 120;
export const DROP_BELOW_FPS = 45;
export const RAISE_ABOVE_FPS = 58;
/** A single stall (GC pause, tab switch) is clamped so it cannot dominate the average. */
const MAX_FRAME_MS = 100;

/** Internal resolution relative to CSS pixels; CSS scales the canvas back up. */
export const QUALITY_SCALE: Readonly<Record<QualityLevel, number>> = {
  high: 0.5,
  medium: 0.35,
  low: 0.25,
};

function averageFps(frameMs: readonly number[], count: number): number {
  let total = 0;
  for (let i = frameMs.length - count; i < frameMs.length; i++) {
    total += Math.min(Math.max(frameMs[i] ?? 0, 0), MAX_FRAME_MS);
  }
  const avgMs = total / count;
  return avgMs > 0 ? 1000 / avgMs : Number.POSITIVE_INFINITY;
}

/** Pure: the quality level for the next frames given the most recent frame durations. */
export function nextQuality(current: QualityLevel, recentFrameMs: readonly number[]): QualityLevel {
  const index = LEVELS.indexOf(current);
  if (recentFrameMs.length >= DROP_WINDOW && index > 0) {
    if (averageFps(recentFrameMs, DROP_WINDOW) < DROP_BELOW_FPS)
      return LEVELS[index - 1] ?? current;
  }
  if (recentFrameMs.length >= RAISE_WINDOW && index < LEVELS.length - 1) {
    if (averageFps(recentFrameMs, RAISE_WINDOW) > RAISE_ABOVE_FPS) {
      return LEVELS[index + 1] ?? current;
    }
  }
  return current;
}
