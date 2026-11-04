export interface Coord {
  readonly col: number;
  readonly row: number;
}

const COLUMN_LETTERS = "ABCDEFGHIJKLMNO";

export function columnLetter(col: number): string {
  const letter = COLUMN_LETTERS[col];
  if (letter === undefined) throw new RangeError(`Column ${col} has no letter`);
  return letter;
}

/** Human label used across UI and combat log, e.g. "C-7". */
export function coordLabel(coord: Coord): string {
  return `${columnLetter(coord.col)}-${coord.row + 1}`;
}

/** Stable map key, e.g. "2:6". */
export function coordKey(coord: Coord): string {
  return `${coord.col}:${coord.row}`;
}

export function isInBounds(coord: Coord, boardSize: number): boolean {
  return (
    Number.isInteger(coord.col) &&
    Number.isInteger(coord.row) &&
    coord.col >= 0 &&
    coord.row >= 0 &&
    coord.col < boardSize &&
    coord.row < boardSize
  );
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function allCoords(boardSize: number): Coord[] {
  const coords: Coord[] = [];
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) coords.push({ col, row });
  }
  return coords;
}

/** The eight surrounding cells (sides and corners) that exist on the board. */
export function neighbours(coord: Coord, boardSize: number): Coord[] {
  const result: Coord[] = [];
  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      if (dRow === 0 && dCol === 0) continue;
      const next = { col: coord.col + dCol, row: coord.row + dRow };
      if (isInBounds(next, boardSize)) result.push(next);
    }
  }
  return result;
}
