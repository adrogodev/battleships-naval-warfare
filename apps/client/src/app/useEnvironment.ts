import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { PlayerProgress } from "../progress/progress";
import { progressStore } from "../progress/progressStore";
import { type Settings, settingsStore } from "../settings/settingsStore";

/** A new screen starts at the top, not where the previous one was scrolled to. */
export function useScrollToTopOn(screen: string): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `screen` is the trigger, not an input
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
}

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

/** Commander rank, statistics and challenges, kept in sync with the progress store. */
export function useProgress(): PlayerProgress {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Reduced motion: the explicit setting wins; "system" follows prefers-reduced-motion. */
export function useReducedMotion(settings: Settings): boolean {
  const systemPrefers = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (settings.motion === "reduced") return true;
  if (settings.motion === "full") return false;
  return systemPrefers;
}

/** Tap-to-aim, tap-again-to-fire on touch screens ("auto") or always/never. */
export function useConfirmShot(settings: Settings): boolean {
  const coarse = useMediaQuery("(pointer: coarse)");
  if (settings.confirmShot === "always") return true;
  if (settings.confirmShot === "never") return false;
  return coarse;
}

/** Single-board layout with the Radar / Mi flota switch. */
export function useCompactLayout(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
