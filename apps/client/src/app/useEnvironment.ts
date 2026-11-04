import { useEffect, useState, useSyncExternalStore } from "react";
import { type Settings, settingsStore } from "../settings/settingsStore";

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
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
