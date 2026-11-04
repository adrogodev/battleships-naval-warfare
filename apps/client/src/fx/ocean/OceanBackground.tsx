import { useEffect, useRef } from "react";
import "../fx.css";
import { OceanRenderer } from "./OceanRenderer";
import { readOceanColors } from "./oceanColors";

export interface OceanBackgroundProps {
  /** Draws a single static frame instead of animating. */
  readonly reducedMotion: boolean;
}

/** Animated ocean behind every screen. Purely decorative. */
export function OceanBackground({ reducedMotion }: OceanBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OceanRenderer | null>(null);
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new OceanRenderer(canvas, {
      colors: readOceanColors(getComputedStyle(document.documentElement)),
    });
    rendererRef.current = renderer;
    const onResize = () => renderer.resize(window.innerWidth, window.innerHeight, devicePixelRatio);
    onResize();
    renderer.setReducedMotion(reducedMotionRef.current);
    renderer.start();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="fx-ocean" aria-hidden="true" tabIndex={-1} />;
}
