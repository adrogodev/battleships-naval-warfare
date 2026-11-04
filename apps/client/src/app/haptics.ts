export type HapticCue = "hitReceived" | "ownSunk" | "victory";

/** Distinct patterns (ms on/off) so each cue is recognisable without looking. */
export const HAPTIC_PATTERNS: Record<HapticCue, readonly number[]> = {
  hitReceived: [70],
  ownSunk: [180, 80, 260],
  victory: [90, 60, 90, 60, 320],
};

export function hapticsSupported(nav: Navigator | undefined = globalThis.navigator): boolean {
  return typeof nav?.vibrate === "function";
}

export function vibrate(
  cue: HapticCue,
  enabled: boolean,
  nav: Navigator | undefined = globalThis.navigator,
): boolean {
  if (!enabled || !hapticsSupported(nav)) return false;
  return nav?.vibrate([...HAPTIC_PATTERNS[cue]]) ?? false;
}
