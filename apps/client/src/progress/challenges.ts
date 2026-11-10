import { DIFFICULTIES } from "@battleships/shared";
import type { GameRecord } from "./game";
import type { PlayerProgress } from "./progress";

/**
 * Optional challenges (S3). Each completed one awards a badge; titles live in
 * t.progress.challenges. Cosmetic only: completing them never changes gameplay.
 * `isMet` receives the finished game and the progress *after* that game was counted.
 */
export const CHALLENGES = [
  {
    id: "hard-under-45",
    isMet: (game: GameRecord) =>
      game.won && game.mode === "ai" && game.difficulty === "hard" && game.stats.shots < 45,
  },
  { id: "carrier-first", isMet: (game: GameRecord) => game.enemyShipsSunk[0] === "carrier" },
  { id: "first-victory", isMet: (game: GameRecord) => game.won },
  { id: "flawless", isMet: (game: GameRecord) => game.won && game.ownShipsLost === 0 },
  { id: "sharpshooter", isMet: (game: GameRecord) => game.won && game.stats.accuracy >= 0.6 },
  { id: "streak-5", isMet: (game: GameRecord) => game.stats.maxStreak >= 5 },
  {
    id: "last-ship",
    isMet: (game: GameRecord) => game.won && game.fleetSize - game.ownShipsLost === 1,
  },
  {
    id: "all-commanders",
    isMet: (_game: GameRecord, progress: PlayerProgress) =>
      DIFFICULTIES.every((difficulty) => progress.byMode.ai[difficulty].won > 0),
  },
  { id: "online-victory", isMet: (game: GameRecord) => game.won && game.mode === "online" },
  { id: "veteran", isMet: (_game: GameRecord, progress: PlayerProgress) => progress.games >= 10 },
] as const satisfies readonly {
  id: string;
  isMet: (game: GameRecord, progress: PlayerProgress) => boolean;
}[];

export type ChallengeId = (typeof CHALLENGES)[number]["id"];

export const CHALLENGE_IDS: readonly ChallengeId[] = CHALLENGES.map((challenge) => challenge.id);

/** Challenges this game meets (whether or not they were completed before). */
export function challengesMet(game: GameRecord, progressAfter: PlayerProgress): ChallengeId[] {
  return CHALLENGES.filter((challenge) => challenge.isMet(game, progressAfter)).map(
    (challenge) => challenge.id,
  );
}
