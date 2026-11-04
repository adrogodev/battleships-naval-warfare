import { DEFAULT_RULES, type Placement } from "@battleships/shared";
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../adapters/localAiGame";
import { currentStreak, musicIntensity, presentBoard } from "./presentation";

const destroyer: Placement = { shipId: "destroyer", bow: { col: 0, row: 0 }, orientation: "h" };
const log: LogEntry[] = [
  { id: 0, seat: 0, coord: { col: 0, row: 0 }, result: "hit" },
  { id: 1, seat: 1, coord: { col: 9, row: 9 }, result: "miss" },
  { id: 2, seat: 0, coord: { col: 1, row: 0 }, result: "sunk", shipId: "destroyer" },
];

describe("presentBoard", () => {
  it("only shows shots the sequence has already revealed", () => {
    const radar = presentBoard({
      log,
      seat: 0,
      impacted: 1,
      sunkRevealed: new Set(),
      sunkPlacements: [destroyer],
      rules: DEFAULT_RULES,
      showBlocked: false,
    });
    expect(Object.fromEntries(radar.marks)).toEqual({ "0:0": "hit" });
    expect(radar.sunkShips).toEqual([]);
  });

  it("shows a sunk ship as hits until its silhouette is revealed", () => {
    const base = {
      log,
      seat: 0 as const,
      impacted: 3,
      sunkPlacements: [destroyer],
      rules: DEFAULT_RULES,
      showBlocked: false,
    };
    const before = presentBoard({ ...base, sunkRevealed: new Set() });
    expect(before.marks.get("1:0")).toBe("hit");
    expect(before.sunkShips).toEqual([]);
    const after = presentBoard({ ...base, sunkRevealed: new Set([2]) });
    expect(after.sunkShips).toEqual([destroyer]);
  });

  it("shades cells around revealed sunk ships only when asked and when no-contact applies", () => {
    const base = {
      log,
      seat: 0 as const,
      impacted: 3,
      sunkRevealed: new Set([2]),
      sunkPlacements: [destroyer],
    };
    const shaded = presentBoard({ ...base, rules: DEFAULT_RULES, showBlocked: true });
    expect([...shaded.blocked].sort()).toEqual(["0:1", "1:1", "2:0", "2:1"]);
    expect(presentBoard({ ...base, rules: DEFAULT_RULES, showBlocked: false }).blocked.size).toBe(
      0,
    );
    const loose = { ...DEFAULT_RULES, noContact: false };
    expect(presentBoard({ ...base, rules: loose, showBlocked: true }).blocked.size).toBe(0);
  });
});

describe("currentStreak", () => {
  const own = (id: number, result: LogEntry["result"]): LogEntry => ({
    id,
    seat: 0,
    coord: { col: id, row: 0 },
    result,
  });
  it("counts consecutive revealed own hits and sinkings, ignoring enemy shots", () => {
    const entries: LogEntry[] = [
      own(0, "miss"),
      own(1, "hit"),
      { id: 2, seat: 1, coord: { col: 0, row: 9 }, result: "hit" },
      own(3, "hit"),
      own(4, "sunk"),
    ];
    expect(currentStreak(entries, 5)).toBe(3);
    expect(currentStreak(entries, 4)).toBe(2);
    expect(currentStreak([...entries, own(5, "miss")], 6)).toBe(0);
  });
});

describe("musicIntensity", () => {
  it("rises with danger and streaks", () => {
    expect(musicIntensity({ ownAfloat: 5, enemyAfloat: 5, streak: 0 })).toBe(1);
    expect(musicIntensity({ ownAfloat: 2, enemyAfloat: 5, streak: 0 })).toBe(2);
    expect(musicIntensity({ ownAfloat: 5, enemyAfloat: 1, streak: 0 })).toBe(3);
    expect(musicIntensity({ ownAfloat: 5, enemyAfloat: 5, streak: 3 })).toBe(3);
  });
});
