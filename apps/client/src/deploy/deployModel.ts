import {
  type Coord,
  type GameRules,
  isInBounds,
  type Orientation,
  type Placement,
  type PlacementCheck,
  type Rng,
  randomFleet,
  type ShipId,
  shipCells,
  shipLength,
  validateFleet,
  validatePlacement,
} from "@battleships/shared";

/** Fleet deployment UI state. Pure functions so the screen stays thin and testable. */
export interface DeployState {
  readonly placed: readonly Placement[];
  readonly selected: ShipId | null;
  readonly orientation: Orientation;
}

function firstInDock(placed: readonly Placement[], rules: GameRules): ShipId | null {
  return rules.fleet.find((ship) => !placed.some((p) => p.shipId === ship.id))?.id ?? null;
}

export function initialDeploy(rules: GameRules): DeployState {
  return { placed: [], selected: firstInDock([], rules), orientation: "h" };
}

export const reset = initialDeploy;

/** Selecting a ship already on the board lifts it back to the dock, keeping its orientation. */
export function select(state: DeployState, shipId: ShipId): DeployState {
  const onBoard = state.placed.find((p) => p.shipId === shipId);
  if (!onBoard) return { ...state, selected: shipId };
  return {
    placed: state.placed.filter((p) => p.shipId !== shipId),
    selected: shipId,
    orientation: onBoard.orientation,
  };
}

export function cancelSelection(state: DeployState): DeployState {
  return { ...state, selected: null };
}

export function rotate(state: DeployState): DeployState {
  return { ...state, orientation: state.orientation === "h" ? "v" : "h" };
}

export function returnToDock(state: DeployState, shipId: ShipId): DeployState {
  return { ...state, placed: state.placed.filter((p) => p.shipId !== shipId) };
}

export function placeAt(
  state: DeployState,
  bow: Coord,
  rules: GameRules,
): { state: DeployState; check: PlacementCheck | null } {
  if (state.selected === null) return { state, check: null };
  const candidate: Placement = { shipId: state.selected, bow, orientation: state.orientation };
  const check = validatePlacement(state.placed, candidate, rules);
  if (!check.ok) return { state, check };
  const placed = [...state.placed, candidate];
  return { state: { ...state, placed, selected: firstInDock(placed, rules) }, check };
}

/** Ghost cells for the selected ship with its bow at `bow`, clipped to the board. */
export function preview(
  state: DeployState,
  bow: Coord,
  rules: GameRules,
): { cells: Coord[]; check: PlacementCheck } | null {
  if (state.selected === null) return null;
  const length = shipLength(rules, state.selected) ?? 0;
  const candidate: Placement = { shipId: state.selected, bow, orientation: state.orientation };
  return {
    cells: shipCells(candidate, length).filter((cell) => isInBounds(cell, rules.boardSize)),
    check: validatePlacement(state.placed, candidate, rules),
  };
}

export function randomize(rules: GameRules, rng: Rng): DeployState {
  return { placed: randomFleet(rules, rng), selected: null, orientation: "h" };
}

export function isFleetReady(state: DeployState, rules: GameRules): boolean {
  return validateFleet(state.placed, rules).ok;
}
