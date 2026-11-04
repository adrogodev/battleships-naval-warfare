import { describe, expect, it, vi } from "vitest";
import { HAPTIC_PATTERNS, vibrate } from "./haptics";

describe("vibrate", () => {
  it("plays a distinct pattern per cue when enabled and supported", () => {
    const nav = { vibrate: vi.fn(() => true) } as unknown as Navigator;
    expect(vibrate("ownSunk", true, nav)).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.ownSunk]);
    const patterns = Object.values(HAPTIC_PATTERNS).map((p) => p.join(","));
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("does nothing when disabled or unsupported", () => {
    const nav = { vibrate: vi.fn(() => true) } as unknown as Navigator;
    expect(vibrate("victory", false, nav)).toBe(false);
    expect(nav.vibrate).not.toHaveBeenCalled();
    expect(vibrate("victory", true, {} as Navigator)).toBe(false);
  });
});
