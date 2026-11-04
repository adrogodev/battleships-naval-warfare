import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../testing/fakes";
import { createFxBus } from "./bursts";
import { FxLayer } from "./FxLayer";

describe("FxLayer", () => {
  let raf: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const { ctx } = createFakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ctx as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
    );
    raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a decorative, non-interactive canvas", () => {
    const { container } = render(<FxLayer enabled bus={createFxBus()} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("fx-layer");
  });

  it("does not run a loop while idle", () => {
    render(<FxLayer enabled bus={createFxBus()} />);
    expect(raf).not.toHaveBeenCalled();
  });

  it("starts the loop when a burst arrives", () => {
    const bus = createFxBus();
    render(<FxLayer enabled bus={bus} />);
    act(() => bus.emit({ kind: "explosion", x: 10, y: 10 }));
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("ignores bursts when disabled", () => {
    const bus = createFxBus();
    render(<FxLayer enabled={false} bus={bus} />);
    act(() => bus.emit({ kind: "explosion", x: 10, y: 10 }));
    expect(raf).not.toHaveBeenCalled();
  });
});
