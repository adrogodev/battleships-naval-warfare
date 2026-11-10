import { describe, expect, it } from "vitest";
import { t } from "../i18n/es";
import { RANKS, rankForXp } from "./ranks";

describe("naval ranks", () => {
  it("goes from Grumete to Almirante de Flota with increasing thresholds", () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(9);
    expect(RANKS.length).toBeLessThanOrEqual(12);
    expect(t.progress.ranks[RANKS[0].id]).toBe("Grumete");
    expect(t.progress.ranks[RANKS[RANKS.length - 1]?.id ?? "grumete"]).toBe("Almirante de Flota");
    expect(RANKS[0].minXp).toBe(0);
    for (let index = 1; index < RANKS.length; index++) {
      expect(RANKS[index]?.minXp).toBeGreaterThan(RANKS[index - 1]?.minXp ?? 0);
    }
  });

  it("starts at Grumete with no experience", () => {
    const rank = rankForXp(0);
    expect(rank.index).toBe(0);
    expect(rank.id).toBe("grumete");
    expect(rank.nextMinXp).toBe(RANKS[1]?.minXp);
    expect(rank.progress).toBe(0);
  });

  it("promotes exactly at each threshold", () => {
    const second = RANKS[1];
    if (!second) throw new Error("missing rank");
    expect(rankForXp(second.minXp - 1).index).toBe(0);
    expect(rankForXp(second.minXp).index).toBe(1);
  });

  it("reports progress towards the next rank", () => {
    const second = RANKS[1];
    if (!second) throw new Error("missing rank");
    expect(rankForXp(second.minXp / 2).progress).toBeCloseTo(0.5);
  });

  it("tops out at Almirante de Flota with no next rank", () => {
    const top = rankForXp(1_000_000);
    expect(top.id).toBe("almirante-flota");
    expect(top.index).toBe(RANKS.length - 1);
    expect(top.nextMinXp).toBeNull();
    expect(top.progress).toBe(1);
  });
});
