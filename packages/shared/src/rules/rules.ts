import { z } from "zod";

export const SHIP_IDS = ["carrier", "battleship", "cruiser", "submarine", "destroyer"] as const;
export type ShipId = (typeof SHIP_IDS)[number];

export const MIN_BOARD_SIZE = 6;
export const MAX_BOARD_SIZE = 15;

const shipSpecSchema = z.object({
  id: z.enum(SHIP_IDS),
  length: z.number().int().min(1),
});

export const gameRulesSchema = z
  .object({
    boardSize: z.number().int().min(MIN_BOARD_SIZE).max(MAX_BOARD_SIZE),
    fleet: z.array(shipSpecSchema).min(1).max(SHIP_IDS.length),
    noContact: z.boolean(),
    turnTimerSec: z.number().int().min(10).max(120).nullable(),
    extraTurnOnHit: z.boolean(),
  })
  .superRefine((rules, ctx) => {
    const ids = rules.fleet.map((ship) => ship.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["fleet"], message: "Ship ids must be unique" });
    }
    for (const [index, ship] of rules.fleet.entries()) {
      if (ship.length > rules.boardSize) {
        ctx.addIssue({
          code: "custom",
          path: ["fleet", index, "length"],
          message: "Ship does not fit on the board",
        });
      }
    }
  });

export type ShipSpec = z.infer<typeof shipSpecSchema>;
export type GameRules = z.infer<typeof gameRulesSchema>;

export const DEFAULT_FLEET: readonly ShipSpec[] = [
  { id: "carrier", length: 5 },
  { id: "battleship", length: 4 },
  { id: "cruiser", length: 3 },
  { id: "submarine", length: 3 },
  { id: "destroyer", length: 2 },
];

export const DEFAULT_RULES: GameRules = {
  boardSize: 10,
  fleet: [...DEFAULT_FLEET],
  noContact: true,
  turnTimerSec: null,
  extraTurnOnHit: false,
};

/** Validates untrusted rules (settings, network). Throws a ZodError when invalid. */
export function parseRules(input: unknown): GameRules {
  return gameRulesSchema.parse(input);
}

export function fleetCellCount(rules: GameRules): number {
  return rules.fleet.reduce((total, ship) => total + ship.length, 0);
}
