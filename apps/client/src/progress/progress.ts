import type { Difficulty } from "@battleships/shared";
import { type ChallengeId, challengesMet } from "./challenges";
import { type GameRecord, wonInBattle } from "./game";
import { type RankInfo, rankForXp } from "./ranks";
import { type XpBreakdown, xpForGame } from "./xp";

/** The heatmap covers the standard 10×10 board; shots outside it are ignored. */
export const HEATMAP_SIZE = 10;
/** How many recent game ids the record-once guard remembers. */
export const RECENT_GAME_IDS = 50;

export interface ModeRecord {
  readonly played: number;
  readonly won: number;
}

/** Everything persisted about the player: rank XP, statistics and challenges (S1–S3). */
export interface PlayerProgress {
  readonly xp: number;
  readonly games: number;
  readonly wins: number;
  readonly byMode: {
    readonly ai: Readonly<Record<Difficulty, ModeRecord>>;
    readonly online: ModeRecord;
  };
  /** Sum of per-game accuracy over `accuracyGames` games with at least one shot. */
  readonly accuracySum: number;
  readonly accuracyGames: number;
  readonly bestStreak: number;
  /** Fewest shots in a victory, or null before the first victory. */
  readonly shortestWinShots: number | null;
  /** Own shot counts, row-major: index = row × HEATMAP_SIZE + col. */
  readonly heatmap: readonly number[];
  readonly completed: readonly ChallengeId[];
  /** Record-once guard: ids of the latest games counted. */
  readonly recentGameIds: readonly string[];
}

const NO_GAMES: ModeRecord = { played: 0, won: 0 };

export const EMPTY_PROGRESS: PlayerProgress = {
  xp: 0,
  games: 0,
  wins: 0,
  byMode: { ai: { easy: NO_GAMES, normal: NO_GAMES, hard: NO_GAMES }, online: NO_GAMES },
  accuracySum: 0,
  accuracyGames: 0,
  bestStreak: 0,
  shortestWinShots: null,
  heatmap: Array.from({ length: HEATMAP_SIZE * HEATMAP_SIZE }, () => 0),
  completed: [],
  recentGameIds: [],
};

/** What the results screen shows about the game just recorded. */
export interface ProgressReport {
  readonly xp: XpBreakdown;
  readonly totalXp: number;
  readonly rankBefore: RankInfo;
  readonly rankAfter: RankInfo;
  readonly rankUp: boolean;
  readonly newChallenges: readonly ChallengeId[];
}

/** Mean of per-game accuracy (games without shots excluded), or null with no data. */
export function averageAccuracy(progress: PlayerProgress): number | null {
  return progress.accuracyGames === 0 ? null : progress.accuracySum / progress.accuracyGames;
}

const tally = (record: ModeRecord, won: boolean): ModeRecord => ({
  played: record.played + 1,
  won: record.won + (won ? 1 : 0),
});

/**
 * Counts one finished game. Returns the same progress and a null report when the game id was
 * already counted (record-once guard: reloads and repeated callbacks never count twice).
 */
export function applyGame(
  progress: PlayerProgress,
  game: GameRecord,
): { progress: PlayerProgress; report: ProgressReport | null } {
  if (progress.recentGameIds.includes(game.id)) return { progress, report: null };

  const xp = xpForGame(game);
  const heatmap = [...progress.heatmap];
  for (const { col, row } of game.ownShots) {
    if (col < 0 || row < 0 || col >= HEATMAP_SIZE || row >= HEATMAP_SIZE) continue;
    const index = row * HEATMAP_SIZE + col;
    heatmap[index] = (heatmap[index] ?? 0) + 1;
  }
  const { ai, online } = progress.byMode;
  const byMode =
    game.mode === "online"
      ? { ai, online: tally(online, game.won) }
      : {
          ai: {
            ...ai,
            [game.difficulty ?? "easy"]: tally(ai[game.difficulty ?? "easy"], game.won),
          },
          online,
        };
  const shots = game.stats.shots;
  const counted: PlayerProgress = {
    ...progress,
    xp: progress.xp + xp.total,
    games: progress.games + 1,
    wins: progress.wins + (game.won ? 1 : 0),
    byMode,
    accuracySum: progress.accuracySum + (shots > 0 ? game.stats.accuracy : 0),
    accuracyGames: progress.accuracyGames + (shots > 0 ? 1 : 0),
    bestStreak: Math.max(progress.bestStreak, game.stats.maxStreak),
    shortestWinShots:
      wonInBattle(game) && shots > 0
        ? Math.min(progress.shortestWinShots ?? Number.POSITIVE_INFINITY, shots)
        : progress.shortestWinShots,
    heatmap,
    recentGameIds: [...progress.recentGameIds, game.id].slice(-RECENT_GAME_IDS),
  };
  const newChallenges = challengesMet(game, counted).filter(
    (id) => !progress.completed.includes(id),
  );
  const next: PlayerProgress = { ...counted, completed: [...progress.completed, ...newChallenges] };
  const rankBefore = rankForXp(progress.xp);
  const rankAfter = rankForXp(next.xp);
  return {
    progress: next,
    report: {
      xp,
      totalXp: next.xp,
      rankBefore,
      rankAfter,
      rankUp: rankAfter.index > rankBefore.index,
      newChallenges,
    },
  };
}
