import type { Seat, ShotRecord } from "@battleships/shared";

export interface BattleStats {
  readonly shots: number;
  readonly hits: number;
  readonly accuracy: number;
  readonly maxStreak: number;
  readonly firstSinkTurn: number | null;
  readonly durationMs: number;
}

export interface BattleClock {
  readonly ownSeat: Seat;
  /** Epoch ms when the battle started, or null before it starts. */
  readonly startedAt: number | null;
  /** Epoch ms when the battle ended, or null while it is still going. */
  readonly endedAt: number | null;
  readonly now: number;
}

/** Per-player battle statistics from the public shot log. Shared by every game adapter. */
export function computeBattleStats(log: readonly ShotRecord[], clock: BattleClock): BattleStats {
  const own = log.filter((entry) => entry.seat === clock.ownSeat);
  let streak = 0;
  let maxStreak = 0;
  let hits = 0;
  let firstSinkTurn: number | null = null;
  for (const [index, entry] of own.entries()) {
    if (entry.result === "miss") {
      streak = 0;
      continue;
    }
    hits++;
    streak++;
    maxStreak = Math.max(maxStreak, streak);
    if (entry.result === "sunk" && firstSinkTurn === null) firstSinkTurn = index + 1;
  }
  const end = clock.endedAt ?? clock.now;
  return {
    shots: own.length,
    hits,
    accuracy: own.length === 0 ? 0 : hits / own.length,
    maxStreak,
    firstSinkTurn,
    durationMs: clock.startedAt === null ? 0 : end - clock.startedAt,
  };
}
