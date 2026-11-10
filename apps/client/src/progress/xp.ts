import { type GameRecord, wonInBattle } from "./game";

export interface XpBreakdown {
  readonly participation: number;
  readonly victory: number;
  readonly accuracy: number;
  readonly sinkings: number;
  readonly total: number;
}

/** Finishing a battle (not abandoning it). */
export const PARTICIPATION_XP = 20;
/** Victory by rival: harder AI commanders and human rivals are worth more. */
export const VICTORY_XP = { easy: 100, normal: 150, hard: 200, online: 150 } as const;
/** Accuracy XP = round(accuracy × ACCURACY_XP). */
export const ACCURACY_XP = 50;
/** Per enemy ship sunk. */
export const SINK_XP = 15;

/**
 * Experience for one game: victory, accuracy and sinkings (S1), plus a small participation bonus.
 * An abandoned battle keeps only its sinkings, so quitting early is never a shortcut; a win by
 * the rival's abandonment keeps everything but the victory bonus.
 */
export function xpForGame(game: GameRecord): XpBreakdown {
  const sinkings = game.enemyShipsSunk.length * SINK_XP;
  if (game.forfeited) {
    return { participation: 0, victory: 0, accuracy: 0, sinkings, total: sinkings };
  }
  const participation = PARTICIPATION_XP;
  const victory = wonInBattle(game)
    ? VICTORY_XP[game.mode === "online" ? "online" : (game.difficulty ?? "easy")]
    : 0;
  const accuracy = Math.round(game.stats.accuracy * ACCURACY_XP);
  return {
    participation,
    victory,
    accuracy,
    sinkings,
    total: participation + victory + accuracy + sinkings,
  };
}
