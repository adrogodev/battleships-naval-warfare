import { describe, expect, it } from "vitest";
import { t } from "../i18n/es";
import { CHALLENGES, type ChallengeId, challengesMet } from "./challenges";
import { applyGame, EMPTY_PROGRESS, type PlayerProgress } from "./progress";
import { gameRecord } from "./testing";

const stats = gameRecord().stats;
/** A defeat that meets no per-game challenge. */
const plainLoss = gameRecord({
  won: false,
  enemyShipsSunk: ["destroyer"],
  stats: { ...stats, maxStreak: 1, accuracy: 0.1 },
  ownShipsLost: 5,
});
const met = (record = plainLoss, progress: PlayerProgress = EMPTY_PROGRESS) =>
  challengesMet(record, progress);
const metOne = (id: ChallengeId, record: Parameters<typeof gameRecord>[0]) =>
  met(gameRecord({ ...plainLoss, ...record })).includes(id);

describe("challenges", () => {
  it("offers between 8 and 12 challenges, each with Spanish copy", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(8);
    expect(CHALLENGES.length).toBeLessThanOrEqual(12);
    for (const challenge of CHALLENGES) {
      expect(t.progress.challenges[challenge.id].title.length).toBeGreaterThan(0);
    }
  });

  it("includes the two example challenges verbatim", () => {
    const titles = CHALLENGES.map((challenge) => t.progress.challenges[challenge.id].title);
    expect(titles).toContain("Gana en Difícil con menos de 45 disparos");
    expect(titles).toContain("Hunde el portaaviones primero");
  });

  it("meets nothing with a plain defeat", () => {
    expect(met()).toEqual([]);
  });

  it("“Gana en Difícil con menos de 45 disparos”", () => {
    const hard = { won: true, mode: "ai", difficulty: "hard" } as const;
    expect(metOne("hard-under-45", { ...hard, stats: { ...stats, shots: 44 } })).toBe(true);
    expect(metOne("hard-under-45", { ...hard, stats: { ...stats, shots: 45 } })).toBe(false);
    expect(
      metOne("hard-under-45", { ...hard, difficulty: "normal", stats: { ...stats, shots: 30 } }),
    ).toBe(false);
    expect(metOne("hard-under-45", { ...hard, won: false, stats: { ...stats, shots: 30 } })).toBe(
      false,
    );
  });

  it("“Hunde el portaaviones primero”", () => {
    expect(metOne("carrier-first", { enemyShipsSunk: ["carrier", "destroyer"] })).toBe(true);
    expect(metOne("carrier-first", { enemyShipsSunk: ["destroyer", "carrier"] })).toBe(false);
    expect(metOne("carrier-first", { enemyShipsSunk: [] })).toBe(false);
  });

  it("first victory: any win", () => {
    expect(metOne("first-victory", { won: true })).toBe(true);
  });

  it("flawless: win without losing a ship", () => {
    expect(metOne("flawless", { won: true, ownShipsLost: 0 })).toBe(true);
    expect(metOne("flawless", { won: true, ownShipsLost: 1 })).toBe(false);
  });

  it("sharpshooter: win with 60 % accuracy or more", () => {
    expect(metOne("sharpshooter", { won: true, stats: { ...stats, accuracy: 0.6 } })).toBe(true);
    expect(metOne("sharpshooter", { won: true, stats: { ...stats, accuracy: 0.59 } })).toBe(false);
  });

  it("streak: 5 hits in a row, win or lose", () => {
    expect(metOne("streak-5", { stats: { ...stats, maxStreak: 5 } })).toBe(true);
    expect(metOne("streak-5", { stats: { ...stats, maxStreak: 4 } })).toBe(false);
  });

  it("last ship: win with a single ship afloat", () => {
    expect(metOne("last-ship", { won: true, ownShipsLost: 4, fleetSize: 5 })).toBe(true);
    expect(metOne("last-ship", { won: true, ownShipsLost: 3, fleetSize: 5 })).toBe(false);
  });

  it("online victory: win a multiplayer game", () => {
    expect(metOne("online-victory", { won: true, mode: "online", difficulty: null })).toBe(true);
    expect(metOne("online-victory", { won: true, mode: "ai" })).toBe(false);
  });

  it("all commanders: beat the AI on every difficulty (across games)", () => {
    let progress = EMPTY_PROGRESS;
    for (const [index, difficulty] of (["easy", "normal"] as const).entries()) {
      progress = applyGame(progress, gameRecord({ id: `g${index}`, difficulty })).progress;
    }
    const hardWin = gameRecord({ id: "g3", difficulty: "hard" });
    expect(challengesMet(hardWin, progress)).not.toContain("all-commanders");
    const after = applyGame(progress, hardWin).progress;
    expect(challengesMet(hardWin, after)).toContain("all-commanders");
  });

  it("veteran: play 10 games", () => {
    let progress = EMPTY_PROGRESS;
    for (let index = 0; index < 9; index++) {
      progress = applyGame(progress, gameRecord({ ...plainLoss, id: `g${index}` })).progress;
    }
    expect(met(plainLoss, progress)).not.toContain("veteran");
    const tenth = applyGame(progress, gameRecord({ ...plainLoss, id: "g10" })).progress;
    expect(met(plainLoss, tenth)).toContain("veteran");
  });
});
