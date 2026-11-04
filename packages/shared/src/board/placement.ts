import { pickOne, type Rng } from "../random/rng";
import type { GameRules, ShipId } from "../rules/rules";
import { type Coord, coordKey, isInBounds, neighbours } from "./coord";

export type Orientation = "h" | "v";

export interface Placement {
  readonly shipId: ShipId;
  /** First cell of the ship: leftmost when horizontal, topmost when vertical. */
  readonly bow: Coord;
  readonly orientation: Orientation;
}

export type PlacementError =
  | "unknown_ship"
  | "duplicate_ship"
  | "out_of_bounds"
  | "overlap"
  | "contact";
export type FleetError = PlacementError | "incomplete";

export type PlacementCheck = { ok: true } | { ok: false; reason: PlacementError };
export type FleetCheck = { ok: true } | { ok: false; reason: FleetError };

export function shipCells(placement: Placement, length: number): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      placement.orientation === "h"
        ? { col: placement.bow.col + i, row: placement.bow.row }
        : { col: placement.bow.col, row: placement.bow.row + i },
    );
  }
  return cells;
}

export function shipLength(rules: GameRules, shipId: ShipId): number | undefined {
  return rules.fleet.find((ship) => ship.id === shipId)?.length;
}

/** Cells of every placed ship, keyed by coordKey. */
export function occupiedCells(
  placements: readonly Placement[],
  rules: GameRules,
): Map<string, ShipId> {
  const occupied = new Map<string, ShipId>();
  for (const placement of placements) {
    const length = shipLength(rules, placement.shipId);
    if (length === undefined) continue;
    for (const cell of shipCells(placement, length)) occupied.set(coordKey(cell), placement.shipId);
  }
  return occupied;
}

/**
 * Checks one candidate against the ships already placed. The same function backs manual
 * placement, random placement, the AI and the server, so the no-contact rule is identical everywhere.
 * With `replacing`, an already placed copy of the same ship is ignored (moving or rotating it).
 */
export function validatePlacement(
  placed: readonly Placement[],
  candidate: Placement,
  rules: GameRules,
  options: { replacing?: boolean } = {},
): PlacementCheck {
  const length = shipLength(rules, candidate.shipId);
  if (length === undefined) return { ok: false, reason: "unknown_ship" };

  const others = placed.filter((p) => p.shipId !== candidate.shipId);
  if (!options.replacing && others.length !== placed.length) {
    return { ok: false, reason: "duplicate_ship" };
  }

  const cells = shipCells(candidate, length);
  if (!cells.every((cell) => isInBounds(cell, rules.boardSize))) {
    return { ok: false, reason: "out_of_bounds" };
  }

  const occupied = occupiedCells(others, rules);
  if (cells.some((cell) => occupied.has(coordKey(cell)))) return { ok: false, reason: "overlap" };

  if (rules.noContact) {
    const touches = cells.some((cell) =>
      neighbours(cell, rules.boardSize).some((n) => occupied.has(coordKey(n))),
    );
    if (touches) return { ok: false, reason: "contact" };
  }

  return { ok: true };
}

/** A fleet is valid when every ship of the rules is placed exactly once and each placement is valid. */
export function validateFleet(fleet: readonly Placement[], rules: GameRules): FleetCheck {
  const placed: Placement[] = [];
  for (const placement of fleet) {
    const check = validatePlacement(placed, placement, rules);
    if (!check.ok) return check;
    placed.push(placement);
  }
  if (placed.length !== rules.fleet.length) return { ok: false, reason: "incomplete" };
  return { ok: true };
}

const MAX_RANDOM_ATTEMPTS = 200;

/** Every valid position for one ship given the ships already placed. */
export function validPlacementsFor(
  placed: readonly Placement[],
  shipId: ShipId,
  rules: GameRules,
): Placement[] {
  const options: Placement[] = [];
  for (const orientation of ["h", "v"] as const) {
    for (let row = 0; row < rules.boardSize; row++) {
      for (let col = 0; col < rules.boardSize; col++) {
        const candidate: Placement = { shipId, bow: { col, row }, orientation };
        if (validatePlacement(placed, candidate, rules).ok) options.push(candidate);
      }
    }
  }
  return options;
}

/**
 * Random valid fleet. Ships are placed longest first; if the board gets stuck the attempt restarts.
 * Deterministic for a given rng state.
 */
export function randomFleet(rules: GameRules, rng: Rng): Placement[] {
  const order = [...rules.fleet].sort((a, b) => b.length - a.length);
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const placed: Placement[] = [];
    for (const ship of order) {
      const options = validPlacementsFor(placed, ship.id, rules);
      if (options.length === 0) break;
      placed.push(pickOne(rng, options));
    }
    if (placed.length === order.length) return placed;
  }
  throw new Error("Could not place the fleet with these rules");
}
