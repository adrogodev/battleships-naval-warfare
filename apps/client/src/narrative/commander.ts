import type { Difficulty, Seat } from "@battleships/shared";
import { t } from "../i18n/es";

/** Key battle moments the rival commander comments on. "ai" is the commander's own fleet. */
export const COMMANDER_MOMENTS = [
  "battleStart",
  "aiSinks",
  "playerSinks",
  "aiLastShip",
  "playerLastShip",
  "aiWins",
  "playerWins",
] as const;

export type CommanderMoment = (typeof COMMANDER_MOMENTS)[number];

export function commanderLines(difficulty: Difficulty, moment: CommanderMoment): readonly string[] {
  return t.commanders[difficulty].lines[moment];
}

/**
 * Commander line for a moment. Like the comms officer, the variant rotates with a caller-given
 * number (log entry id, shot count…), so consecutive comments do not repeat the same sentence.
 */
export function commanderComment(
  difficulty: Difficulty,
  moment: CommanderMoment,
  variant: number,
): string {
  const lines = commanderLines(difficulty, moment);
  const count = lines.length;
  const index = ((Math.trunc(variant) % count) + count) % count;
  return lines[index] ?? lines[0] ?? "";
}

/**
 * Moment after a sinking by `seat` (0 = player, 1 = AI), given how many ships the losing side
 * still has afloat. Null when that fleet is gone: the finale comment covers it.
 */
export function commanderMomentAfterSink(
  shooter: Seat,
  targetAfloat: number,
): CommanderMoment | null {
  if (targetAfloat <= 0) return null;
  if (shooter === 0) return targetAfloat === 1 ? "aiLastShip" : "playerSinks";
  return targetAfloat === 1 ? "playerLastShip" : "aiSinks";
}
