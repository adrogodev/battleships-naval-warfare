/**
 * Commander naval ranks, from Grumete to Almirante de Flota, by total experience (XP).
 * Names live in i18n (t.progress.ranks). Purely cosmetic: ranks never change gameplay.
 */
export const RANKS = [
  { id: "grumete", minXp: 0 },
  { id: "marinero", minXp: 100 },
  { id: "cabo", minXp: 250 },
  { id: "suboficial", minXp: 500 },
  { id: "alferez-navio", minXp: 850 },
  { id: "teniente-navio", minXp: 1300 },
  { id: "capitan-fragata", minXp: 1900 },
  { id: "capitan-navio", minXp: 2700 },
  { id: "contraalmirante", minXp: 3800 },
  { id: "almirante-flota", minXp: 5200 },
] as const;

export type RankId = (typeof RANKS)[number]["id"];

export interface RankInfo {
  /** 0 = Grumete; RANKS.length - 1 = Almirante de Flota. */
  readonly index: number;
  readonly id: RankId;
  readonly minXp: number;
  /** XP needed for the next rank, or null at the top rank. */
  readonly nextMinXp: number | null;
  /** 0..1 progress from this rank's threshold to the next one (1 at the top rank). */
  readonly progress: number;
}

export function rankForXp(xp: number): RankInfo {
  let index = 0;
  for (const [candidate, rank] of RANKS.entries()) {
    if (xp >= rank.minXp) index = candidate;
  }
  const rank = RANKS[index] ?? RANKS[0];
  const next = RANKS[index + 1];
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return {
    index,
    id: rank.id,
    minXp: rank.minXp,
    nextMinXp: next?.minXp ?? null,
    progress: Math.min(1, Math.max(0, progress)),
  };
}
