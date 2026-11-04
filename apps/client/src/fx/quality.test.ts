import { describe, expect, it } from "vitest";
import { DROP_WINDOW, nextQuality, RAISE_WINDOW } from "./quality";

const frames = (ms: number, n: number): number[] => Array.from({ length: n }, () => ms);

describe("nextQuality", () => {
  it("drops one level when the average fps over the window is below 45", () => {
    const slow = frames(33, DROP_WINDOW); // ~30 fps
    expect(nextQuality("high", slow)).toBe("medium");
    expect(nextQuality("medium", slow)).toBe("low");
  });

  it("never drops below low", () => {
    expect(nextQuality("low", frames(50, DROP_WINDOW))).toBe("low");
  });

  it("keeps the level while the window is too short to judge", () => {
    expect(nextQuality("high", frames(50, DROP_WINDOW - 1))).toBe("high");
  });

  it("does not drop on a single bad frame among good ones", () => {
    const window = [...frames(16.7, DROP_WINDOW - 1), 400];
    expect(nextQuality("high", window)).toBe("high");
  });

  it("does not raise on a short good window", () => {
    expect(nextQuality("low", frames(16, DROP_WINDOW))).toBe("low");
    expect(nextQuality("low", frames(16, RAISE_WINDOW - 1))).toBe("low");
  });

  it("raises one level only after a sustained window above 58 fps", () => {
    expect(nextQuality("low", frames(16, RAISE_WINDOW))).toBe("medium");
    expect(nextQuality("medium", frames(16, RAISE_WINDOW))).toBe("high");
    expect(nextQuality("high", frames(16, RAISE_WINDOW))).toBe("high");
  });

  it("holds the level between the two thresholds", () => {
    const fiftyFps = frames(20, RAISE_WINDOW);
    expect(nextQuality("medium", fiftyFps)).toBe("medium");
  });

  it("judges only the most recent frames of a long history", () => {
    const history = [...frames(16, RAISE_WINDOW), ...frames(33, DROP_WINDOW)];
    expect(nextQuality("high", history)).toBe("medium");
  });
});
