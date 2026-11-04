/**
 * Test doubles for the Canvas 2D effects. Not imported by production code.
 */

export interface FakeContext {
  readonly ctx: CanvasRenderingContext2D;
  /** Names of every method invoked on the context, in call order. */
  readonly calls: string[];
}

/** A CanvasRenderingContext2D stand-in that records method calls and accepts any property write. */
export function createFakeContext(): FakeContext {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const props: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(props, {
    get(target, key) {
      if (key in target) return target[key];
      return (..._args: unknown[]) => {
        calls.push(String(key));
        if (
          key === "createRadialGradient" ||
          key === "createLinearGradient" ||
          key === "createConicGradient"
        ) {
          return gradient;
        }
        return undefined;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

export interface FakeCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly context: FakeContext | null;
}

/** A minimal canvas whose getContext returns a fake context, or null when `withContext` is false. */
export function createFakeCanvas(withContext = true): FakeCanvas {
  const context = withContext ? createFakeContext() : null;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context?.ctx ?? null,
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

/** Manually driven requestAnimationFrame / cancelAnimationFrame pair. */
export class FakeFrames {
  private nextId = 1;
  private readonly pending = new Map<number, FrameRequestCallback>();
  requested = 0;
  cancelled: number[] = [];

  readonly raf = (cb: FrameRequestCallback): number => {
    const id = this.nextId++;
    this.pending.set(id, cb);
    this.requested++;
    return id;
  };

  readonly caf = (id: number): void => {
    this.cancelled.push(id);
    this.pending.delete(id);
  };

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Runs every currently pending callback once with the given timestamp. */
  flush(time: number): void {
    const batch = [...this.pending.entries()];
    this.pending.clear();
    for (const [, cb] of batch) cb(time);
  }
}

/** A document-like visibility source that tests can toggle. */
export class FakeVisibilityDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}
