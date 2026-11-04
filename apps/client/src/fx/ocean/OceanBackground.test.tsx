import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OceanBackground } from "./OceanBackground";
import { DEFAULT_OCEAN_COLORS, readOceanColors } from "./oceanColors";

describe("readOceanColors", () => {
  it("reads the token variables and falls back to token values when missing", () => {
    const values: Record<string, string> = { "--c-sonar": " #00ff00 " };
    const colors = readOceanColors({ getPropertyValue: (name) => values[name] ?? "" });
    expect(colors.sonar).toBe("#00ff00");
    expect(colors.abyss).toBe(DEFAULT_OCEAN_COLORS.abyss);
  });
});

describe("OceanBackground", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a decorative full-viewport canvas and survives a null context", () => {
    const { container, rerender, unmount } = render(<OceanBackground reducedMotion={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("fx-ocean");
    rerender(<OceanBackground reducedMotion />);
    expect(() => unmount()).not.toThrow();
  });
});
