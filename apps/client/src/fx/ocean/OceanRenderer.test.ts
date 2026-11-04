import { describe, expect, it } from "vitest";
import { createFakeCanvas, FakeFrames, FakeVisibilityDocument } from "../testing/fakes";
import { OceanRenderer } from "./OceanRenderer";
import { DEFAULT_OCEAN_COLORS } from "./oceanColors";

function setup(options: { withContext?: boolean } = {}) {
  const { canvas, context } = createFakeCanvas(options.withContext ?? true);
  const frames = new FakeFrames();
  const doc = new FakeVisibilityDocument();
  let clock = 0;
  const renderer = new OceanRenderer(canvas, {
    colors: DEFAULT_OCEAN_COLORS,
    doc,
    now: () => clock,
    raf: frames.raf,
    caf: frames.caf,
  });
  renderer.resize(800, 600, 1);
  const advance = (ms: number) => {
    clock += ms;
    frames.flush(clock);
  };
  return { canvas, context, frames, doc, renderer, advance };
}

describe("OceanRenderer", () => {
  it("draws a frame and keeps requesting frames while running", () => {
    const { frames, context, renderer, advance } = setup();
    renderer.start();
    expect(frames.requested).toBe(1);
    advance(16);
    advance(16);
    expect(frames.requested).toBe(3);
    expect(context?.calls).toContain("fillRect");
  });

  it("renders at a reduced internal resolution", () => {
    const { canvas } = setup();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.width).toBeLessThan(800);
    expect(canvas.height).toBeLessThan(600);
  });

  it("stops requesting frames when the document becomes hidden and resumes when visible", () => {
    const { frames, doc, renderer, advance } = setup();
    renderer.start();
    advance(16);
    doc.setVisibility("hidden");
    expect(frames.pendingCount).toBe(0);
    expect(frames.cancelled.length).toBe(1);
    const requestedWhileHidden = frames.requested;
    advance(16);
    expect(frames.requested).toBe(requestedWhileHidden);

    doc.setVisibility("visible");
    expect(frames.pendingCount).toBe(1);
    advance(16);
    expect(frames.pendingCount).toBe(1);
  });

  it("does not start animating while the document is hidden", () => {
    const { frames, doc, renderer } = setup();
    doc.setVisibility("hidden");
    renderer.start();
    expect(frames.requested).toBe(0);
  });

  it("with reduced motion draws one static frame and requests no further frames", () => {
    const { frames, context, renderer } = setup();
    renderer.setReducedMotion(true);
    renderer.start();
    expect(frames.requested).toBe(0);
    expect(context?.calls).toContain("fillRect");
  });

  it("switching reduced motion on while running cancels the loop after drawing once", () => {
    const { frames, context, renderer, advance } = setup();
    renderer.start();
    advance(16);
    context?.calls.splice(0);
    renderer.setReducedMotion(true);
    expect(frames.pendingCount).toBe(0);
    expect(context?.calls).toContain("fillRect");
    advance(16);
    expect(frames.pendingCount).toBe(0);
    renderer.setReducedMotion(false);
    expect(frames.pendingCount).toBe(1);
  });

  it("stop and dispose cancel the loop and stop listening to visibility", () => {
    const { frames, doc, renderer, advance } = setup();
    renderer.start();
    advance(16);
    renderer.dispose();
    expect(frames.pendingCount).toBe(0);
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(frames.pendingCount).toBe(0);
  });

  it("lowers its quality when frames are slow", () => {
    const { renderer, advance } = setup();
    renderer.start();
    advance(16);
    expect(renderer.quality).toBe("high");
    for (let i = 0; i < 40; i++) advance(40);
    expect(renderer.quality).toBe("medium");
  });

  it("ignores the long gap after resuming from a hidden tab", () => {
    const { doc, renderer, advance } = setup();
    renderer.start();
    advance(16);
    doc.setVisibility("hidden");
    advance(60_000);
    doc.setVisibility("visible");
    for (let i = 0; i < 40; i++) advance(16);
    expect(renderer.quality).toBe("high");
  });

  it("tolerates a null 2D context", () => {
    const { frames, doc, renderer } = setup({ withContext: false });
    expect(() => {
      renderer.start();
      renderer.resize(100, 100, 2);
      renderer.setReducedMotion(true);
      doc.setVisibility("hidden");
      doc.setVisibility("visible");
      renderer.stop();
      renderer.dispose();
    }).not.toThrow();
    expect(frames.requested).toBe(0);
  });
});
