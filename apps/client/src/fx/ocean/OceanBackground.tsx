import { useEffect, useRef } from "react";
import "../fx.css";
import { OceanRenderer } from "./OceanRenderer";
import { readOceanColors } from "./oceanColors";

export interface OceanBackgroundProps {
  /** Draws a single static frame instead of animating (reduced motion, boot screen). */
  readonly still: boolean;
}

/** Animated ocean behind every screen. Purely decorative. */
export function OceanBackground({ still }: OceanBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OceanRenderer | null>(null);
  const stillRef = useRef(still);
  stillRef.current = still;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new OceanRenderer(canvas, {
      colors: readOceanColors(getComputedStyle(document.documentElement)),
    });
    rendererRef.current = renderer;
    const onResize = () => renderer.resize(window.innerWidth, window.innerHeight, devicePixelRatio);
    onResize();
    renderer.setReducedMotion(stillRef.current);
    renderer.start();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(still);
  }, [still]);

  return <canvas ref={canvasRef} className="fx-ocean" aria-hidden="true" tabIndex={-1} />;
}
