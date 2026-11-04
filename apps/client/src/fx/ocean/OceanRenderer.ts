import { withAlpha } from "../color";
import { nextQuality, QUALITY_SCALE, type QualityLevel, RAISE_WINDOW } from "../quality";
import type { OceanColors } from "./oceanColors";

/** The part of `Document` the renderer needs, so tests can inject a fake. */
export type VisibilitySource = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

export interface OceanRendererOptions {
  readonly colors: OceanColors;
  readonly doc?: VisibilitySource;
  readonly now?: () => number;
  readonly raf?: (callback: FrameRequestCallback) => number;
  readonly caf?: (handle: number) => void;
}

/** Wave bands drawn per quality level. */
const BAND_COUNT: Readonly<Record<QualityLevel, number>> = { high: 9, medium: 6, low: 4 };
/** Glints (reflections) drawn per quality level. */
const GLINT_COUNT: Readonly<Record<QualityLevel, number>> = { high: 14, medium: 8, low: 0 };
/** Moment of the static frame used with reduced motion, chosen for a pleasant composition. */
const STATIC_TIME_S = 12;
/** Upper bound of device pixel ratio honoured; the ocean is soft, more pixels buy nothing. */
const MAX_DPR = 2;

/**
 * Animated dark water on a Canvas 2D: deep gradient, slow wave bands, drifting
 * reflections and edge fog. Renders at reduced internal resolution, pauses while
 * the tab is hidden and lowers its quality when frames drop.
 */
export class OceanRenderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly colors: OceanColors;
  private readonly doc: VisibilitySource | null;
  private readonly now: () => number;
  private readonly raf: (callback: FrameRequestCallback) => number;
  private readonly caf: (handle: number) => void;

  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private wanted = false;
  private reducedMotion = false;
  private disposed = false;
  private handle: number | null = null;
  private lastFrame: number | null = null;
  private readonly startedAt: number;
  private readonly frameTimes: number[] = [];
  private level: QualityLevel = "high";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: OceanRendererOptions,
  ) {
    this.ctx = canvas.getContext("2d");
    this.colors = options.colors;
    this.doc = options.doc ?? (typeof document === "undefined" ? null : document);
    this.now = options.now ?? (() => performance.now());
    this.raf = options.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = options.caf ?? ((h) => cancelAnimationFrame(h));
    this.startedAt = this.now();
    this.doc?.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  get quality(): QualityLevel {
    return this.level;
  }

  start(): void {
    if (this.disposed) return;
    this.wanted = true;
    if (this.reducedMotion) {
      this.drawFrame(STATIC_TIME_S);
      return;
    }
    this.schedule();
  }

  stop(): void {
    this.wanted = false;
    this.cancel();
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.cssWidth = Math.max(0, width);
    this.cssHeight = Math.max(0, height);
    this.dpr = Math.min(Math.max(devicePixelRatio, 1), MAX_DPR);
    this.applySize();
    // Resizing clears the canvas: repaint at once unless the loop will do it next frame.
    if (this.handle === null) this.drawFrame(this.reducedMotion ? STATIC_TIME_S : this.elapsed());
  }

  /** On: draw one static frame and stop animating. Off: resume if started. */
  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on) {
      this.cancel();
      this.drawFrame(STATIC_TIME_S);
    } else if (this.wanted) {
      this.schedule();
    }
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.doc?.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (this.isHidden()) {
      this.cancel();
    } else if (this.wanted && !this.reducedMotion) {
      this.schedule();
    }
  };

  private isHidden(): boolean {
    return this.doc?.visibilityState === "hidden";
  }

  private schedule(): void {
    if (!this.ctx || this.disposed || this.handle !== null || this.isHidden()) return;
    this.handle = this.raf(this.tick);
  }

  private cancel(): void {
    if (this.handle !== null) this.caf(this.handle);
    this.handle = null;
    // Forget the last timestamp so the paused gap never counts as a slow frame.
    this.lastFrame = null;
  }

  private readonly tick = (): void => {
    this.handle = null;
    const now = this.now();
    if (this.lastFrame !== null) this.recordFrame(now - this.lastFrame);
    this.lastFrame = now;
    this.drawFrame(this.elapsed());
    this.schedule();
  };

  private recordFrame(ms: number): void {
    this.frameTimes.push(ms);
    if (this.frameTimes.length > RAISE_WINDOW) this.frameTimes.shift();
    const next = nextQuality(this.level, this.frameTimes);
    if (next !== this.level) {
      this.level = next;
      this.frameTimes.length = 0;
      this.applySize();
    }
  }

  private elapsed(): number {
    return (this.now() - this.startedAt) / 1000;
  }

  private applySize(): void {
    const scale = QUALITY_SCALE[this.level] * this.dpr;
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * scale));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * scale));
  }

  private drawFrame(t: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!ctx || w <= 0 || h <= 0) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.drawDepth(ctx, w, h);
    this.drawGlows(ctx, w, h, t);
    this.drawBands(ctx, w, h, t);
    this.drawGlints(ctx, w, h, t);
    this.drawFog(ctx, w, h);
    ctx.globalAlpha = 1;
  }

  /** Abyss to water: light comes from below the horizon, like the approved prototype. */
  private drawDepth(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const r = Math.max(w, h) * 1.15;
    const g = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, r);
    g.addColorStop(0, this.colors.water);
    g.addColorStop(0.35, this.colors.deep);
    g.addColorStop(0.75, this.colors.abyss);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Two broad, slowly drifting tinted patches (sonar and signal) for depth variation. */
  private drawGlows(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const glows = [
      { color: this.colors.sonar, x: 0.3, y: 0.6, r: 0.45, alpha: 0.07, speed: 0.045 },
      { color: this.colors.signal, x: 0.7, y: 0.4, r: 0.4, alpha: 0.08, speed: 0.03 },
    ];
    for (const glow of glows) {
      const cx = w * (glow.x + 0.06 * Math.sin(t * glow.speed * Math.PI));
      const cy = h * (glow.y + 0.04 * Math.cos(t * glow.speed * 1.3 * Math.PI));
      const radius = Math.max(w, h) * glow.r;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, withAlpha(glow.color, glow.alpha));
      g.addColorStop(1, transparent(glow.color));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Thin sine ripple lines, denser and fainter towards the horizon. */
  private drawBands(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const bands = BAND_COUNT[this.level];
    const step = Math.max(4, w / 32);
    ctx.lineWidth = Math.max(1, h / 300);
    ctx.strokeStyle = this.colors.miss;
    for (let i = 0; i < bands; i++) {
      const depth = (i + 1) / bands; // 0 = horizon, 1 = foreground
      const baseY = h * (0.12 + 0.86 * depth ** 1.4);
      const amp = h * (0.004 + 0.012 * depth);
      const freq = (Math.PI * 2 * (2.2 - depth)) / w;
      const phase = t * (0.18 + 0.05 * i) + i * 1.7;
      ctx.globalAlpha = 0.025 + 0.035 * depth;
      ctx.beginPath();
      for (let x = -step; x <= w + step; x += step) {
        const y =
          baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 0.37 - phase * 0.6) * amp;
        if (x === -step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Short horizontal reflections that slide and pulse slowly. */
  private drawGlints(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const count = GLINT_COUNT[this.level];
    if (count === 0) return;
    ctx.fillStyle = this.colors.sonar;
    for (let i = 0; i < count; i++) {
      const seedX = fract(Math.sin(i * 12.9898) * 43758.5453);
      const seedY = fract(Math.sin(i * 78.233) * 12345.6789);
      const x = fract(seedX + t * 0.004 * (1 + seedY)) * w;
      const y = h * (0.3 + 0.65 * seedY);
      const pulse = 0.5 + 0.5 * Math.sin(t * (0.6 + seedX) + i);
      ctx.globalAlpha = 0.05 * pulse * (0.4 + seedY);
      ctx.fillRect(x, y, w * (0.015 + 0.02 * seedX), Math.max(1, h / 400));
    }
    ctx.globalAlpha = 1;
  }

  /** Vignette that sinks the edges into the abyss. */
  private drawFog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    g.addColorStop(0, transparent(this.colors.abyss));
    g.addColorStop(1, withAlpha(this.colors.abyss, 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function fract(n: number): number {
  return n - Math.floor(n);
}

/** Fully transparent version of a color, keeping its hue for clean gradient interpolation. */
function transparent(color: string): string {
  const faded = withAlpha(color, 0);
  return faded === color ? "rgba(0, 0, 0, 0)" : faded;
}
