import { useEffect, useRef } from "react";
import "../fx.css";
import { type FxBus, fxBus } from "./bursts";
import { ParticlePool } from "./ParticlePool";

export interface FxLayerProps {
  /** False with reduced motion: bursts are ignored and live particles cleared. */
  readonly enabled: boolean;
  /** Bus to listen to; defaults to the app-wide `fxBus`. */
  readonly bus?: FxBus;
}

/** Upper bound of a simulated step, so a stalled tab does not teleport particles. */
const MAX_STEP_MS = 50;
const MAX_DPR = 2;

/**
 * Transparent particle canvas above the boards. The animation loop runs only
 * while particles are alive; there is no idle loop.
 */
export function FxLayer({ enabled, bus = fxBus }: FxLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const clearRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !ctx) return;
    const pool = new ParticlePool();
    let handle: number | null = null;
    let last: number | null = null;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (time: number) => {
      handle = null;
      const dt = last === null ? 16 : Math.min(time - last, MAX_STEP_MS);
      last = time;
      pool.update(dt);
      ctx.clearRect(0, 0, width, height);
      pool.draw(ctx);
      if (pool.liveCount > 0) handle = requestAnimationFrame(frame);
      else last = null;
    };

    const stopLoop = () => {
      if (handle !== null) cancelAnimationFrame(handle);
      handle = null;
      last = null;
    };

    clearRef.current = () => {
      stopLoop();
      pool.clear();
      ctx.clearRect(0, 0, width, height);
    };

    resize();
    window.addEventListener("resize", resize);
    const unsubscribe = bus.subscribe((burst) => {
      if (!enabledRef.current) return;
      pool.spawn(burst.kind, burst.x, burst.y, burst.count);
      if (handle === null) handle = requestAnimationFrame(frame);
    });

    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      stopLoop();
      clearRef.current = () => undefined;
    };
  }, [bus]);

  useEffect(() => {
    if (!enabled) clearRef.current();
  }, [enabled]);

  return <canvas ref={canvasRef} className="fx-layer" aria-hidden="true" tabIndex={-1} />;
}
