import type { ParticleKind } from "./ParticlePool";

/** One particle burst at viewport (client) coordinates. */
export interface FxBurst {
  readonly kind: ParticleKind;
  readonly x: number;
  readonly y: number;
  readonly count?: number;
}

export type FxListener = (burst: FxBurst) => void;

export interface FxBus {
  emit(burst: FxBurst): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: FxListener): () => void;
}

export function createFxBus(): FxBus {
  const listeners = new Set<FxListener>();
  return {
    emit(burst) {
      for (const listener of [...listeners]) listener(burst);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** App-wide bus the FxLayer listens to. */
export const fxBus: FxBus = createFxBus();

export type ShotFxResult = "miss" | "hit" | "sunk";

/** The bursts that dramatize one shot result at the given viewport point. */
export function burstPreset(result: ShotFxResult, x = 0, y = 0): FxBurst[] {
  switch (result) {
    case "miss":
      return [{ kind: "splash", x, y, count: 14 }];
    case "hit":
      return [
        { kind: "explosion", x, y, count: 22 },
        { kind: "smoke", x, y, count: 6 },
      ];
    case "sunk":
      return [
        { kind: "explosion", x, y, count: 44 },
        { kind: "debris", x, y, count: 16 },
        { kind: "smoke", x, y, count: 12 },
      ];
  }
}
