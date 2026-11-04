import { DEFAULT_PARTICLE_PALETTE, type ParticlePalette } from "./palette";

export type ParticleKind = "splash" | "explosion" | "smoke" | "debris";

/** How a particle is painted. */
type Shape = "dot" | "ring" | "puff" | "shard";

/** One preallocated, mutable particle. Positions in CSS pixels, velocities in px/ms. */
export interface Particle {
  alive: boolean;
  kind: ParticleKind;
  shape: Shape;
  /** Spawn order; the smallest live value is the oldest particle. */
  serial: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** px/ms² added to vy every millisecond. */
  gravity: number;
  /** Fraction of velocity kept per 16 ms. */
  drag: number;
  age: number;
  life: number;
  size: number;
  /** Size change in px/ms. */
  growth: number;
  rotation: number;
  spin: number;
  alpha: number;
  color: string;
  additive: boolean;
}

export interface ParticlePoolOptions {
  readonly palette?: ParticlePalette;
  /** Random source in [0, 1); injectable for deterministic tests. */
  readonly random?: () => number;
}

export const DEFAULT_CAPACITY = 150;
/** No particle lives longer than this. */
export const MAX_PARTICLE_LIFE_MS = 2000;

const DEFAULT_COUNT: Readonly<Record<ParticleKind, number>> = {
  splash: 14,
  explosion: 22,
  smoke: 7,
  debris: 10,
};

function createParticle(): Particle {
  return {
    alive: false,
    kind: "splash",
    shape: "dot",
    serial: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 1,
    age: 0,
    life: 1,
    size: 1,
    growth: 0,
    rotation: 0,
    spin: 0,
    alpha: 1,
    color: "#ffffff",
    additive: false,
  };
}

/**
 * Fixed-capacity particle system. Every particle object is allocated once in the
 * constructor and reused; when full, the oldest live particle is recycled.
 */
export class ParticlePool {
  readonly particles: readonly Particle[];
  private readonly palette: ParticlePalette;
  private readonly random: () => number;
  private live = 0;
  private serial = 0;

  constructor(
    readonly capacity: number = DEFAULT_CAPACITY,
    options: ParticlePoolOptions = {},
  ) {
    this.particles = Array.from({ length: Math.max(1, Math.floor(capacity)) }, createParticle);
    this.palette = options.palette ?? DEFAULT_PARTICLE_PALETTE;
    this.random = options.random ?? Math.random;
  }

  get liveCount(): number {
    return this.live;
  }

  spawn(kind: ParticleKind, x: number, y: number, count: number = DEFAULT_COUNT[kind]): void {
    const n = Math.max(0, Math.floor(count));
    for (let i = 0; i < n; i++) {
      const p = this.acquire();
      this.init(p, kind, x, y, i);
    }
  }

  update(dtMs: number): void {
    if (this.live === 0 || dtMs <= 0) return;
    const dragSteps = dtMs / 16;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dtMs;
      if (p.age >= p.life) {
        p.alive = false;
        this.live--;
        continue;
      }
      const keep = p.drag ** dragSteps;
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.size = Math.max(0, p.size + p.growth * dtMs);
      p.rotation += p.spin * dtMs;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.live > 0) {
      for (const p of this.particles) {
        if (p.alive) drawParticle(ctx, p);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  clear(): void {
    for (const p of this.particles) p.alive = false;
    this.live = 0;
  }

  /** A dead slot if any, otherwise the oldest live particle. */
  private acquire(): Particle {
    let oldest: Particle | undefined;
    for (const p of this.particles) {
      if (!p.alive) {
        this.live++;
        return p;
      }
      if (!oldest || p.serial < oldest.serial) oldest = p;
    }
    // particles is never empty, so oldest is defined here.
    return oldest as Particle;
  }

  private range(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private init(p: Particle, kind: ParticleKind, x: number, y: number, index: number): void {
    const angle = this.range(0, Math.PI * 2);
    p.alive = true;
    p.kind = kind;
    p.serial = ++this.serial;
    p.x = x;
    p.y = y;
    p.age = 0;
    p.rotation = 0;
    p.spin = 0;
    p.growth = 0;
    p.drag = 1;
    p.gravity = 0;
    p.additive = false;
    switch (kind) {
      case "splash": {
        if (index === 0) {
          // The first particle of a splash is the expanding ring on the water.
          p.shape = "ring";
          p.vx = 0;
          p.vy = 0;
          p.size = 3;
          p.growth = 0.05;
          p.life = this.range(550, 700);
          p.alpha = 0.7;
        } else {
          p.shape = "dot";
          const speed = this.range(0.08, 0.2);
          p.vx = Math.cos(angle) * speed * 0.7;
          p.vy = -this.range(0.18, 0.38);
          p.gravity = 0.0011;
          p.size = this.range(1.2, 2.6);
          p.life = this.range(450, 750);
          p.alpha = 0.9;
        }
        p.color = this.palette.miss;
        break;
      }
      case "explosion": {
        p.shape = "dot";
        const speed = this.range(0.15, 0.55);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.drag = 0.9;
        p.size = this.range(1.5, 3.5);
        p.growth = -0.002;
        p.life = this.range(300, 650);
        p.alpha = 1;
        p.color = this.random() < 0.55 ? this.palette.hit : this.palette.warning;
        p.additive = true;
        break;
      }
      case "smoke": {
        p.shape = "puff";
        p.x = x + this.range(-6, 6);
        p.y = y + this.range(-4, 4);
        p.vx = this.range(-0.012, 0.012);
        p.vy = -this.range(0.025, 0.055);
        p.drag = 0.995;
        p.size = this.range(5, 9);
        p.growth = this.range(0.01, 0.018);
        p.life = this.range(1200, 1800);
        p.alpha = 0.32;
        p.color = this.random() < 0.5 ? this.palette.steel : this.palette.textDim;
        break;
      }
      case "debris": {
        p.shape = "shard";
        const speed = this.range(0.12, 0.38);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 0.15;
        p.gravity = 0.0009;
        p.drag = 0.97;
        p.size = this.range(1.5, 3.5);
        p.spin = this.range(-0.02, 0.02);
        p.life = this.range(700, 1100);
        p.alpha = 1;
        p.color = this.palette.steel;
        break;
      }
    }
    p.life = Math.min(p.life, MAX_PARTICLE_LIFE_MS);
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const t = p.age / p.life;
  // Ease out: particles hold their brightness, then fade fast at the end.
  ctx.globalAlpha = p.alpha * (1 - t * t);
  ctx.globalCompositeOperation = p.additive ? "lighter" : "source-over";
  switch (p.shape) {
    case "ring":
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "shard":
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.rect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      ctx.fill();
      ctx.restore();
      break;
    default:
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
  }
}
