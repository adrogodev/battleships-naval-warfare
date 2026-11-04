import {
  type Coord,
  columnLetter,
  coordLabel,
  type Placement,
  sameCoord,
} from "@battleships/shared";
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { ShipSilhouette } from "./ShipSilhouette";

export type CellKind = "empty" | "miss" | "hit" | "sunk" | "blocked" | "ghost-ok" | "ghost-bad";

export interface CellView {
  readonly kind: CellKind;
  /** Accessible state, e.g. "impacto". The coordinate is prepended by the board. */
  readonly label: string;
}

export interface BoardShip {
  readonly placement: Placement;
  readonly length: number;
  readonly state: "intact" | "damaged" | "sunk";
}

interface BoardProps {
  readonly size: number;
  readonly label: string;
  /** deck: own water with ships visible · radar: dark sweep, only what was discovered. */
  readonly variant: "deck" | "radar";
  readonly cellAt: (coord: Coord) => CellView;
  readonly ships?: readonly BoardShip[];
  /** Cell under the targeting reticle, with its coordinate tag. */
  readonly aim?: Coord | null;
  /** Cell a projectile is flying towards (suspense phase). */
  readonly incoming?: Coord | null;
  /** When omitted the board is display-only. */
  readonly onActivate?: (coord: Coord) => void;
  readonly onPoint?: (coord: Coord | null) => void;
  readonly onCellPointerDown?: (coord: Coord, event: PointerEvent<HTMLButtonElement>) => void;
  /** Interactive board that currently ignores activation (e.g. not your turn). */
  readonly locked?: boolean;
  readonly className?: string;
}

interface CellHandlers {
  click(coord: Coord): void;
  pointerDown(coord: Coord, event: PointerEvent<HTMLButtonElement>): void;
  point(coord: Coord): void;
  focus(coord: Coord): void;
}

interface CellProps {
  readonly col: number;
  readonly row: number;
  readonly kind: CellKind;
  readonly label: string;
  readonly aim: boolean;
  readonly incoming: boolean;
  readonly interactive: boolean;
  readonly focusable: boolean;
  readonly locked: boolean;
  readonly handlers: CellHandlers;
}

/** Memoised on primitive props: a shot re-renders only the cells whose state changed. */
const Cell = memo(function Cell(props: CellProps) {
  const { col, row, kind, label, aim, incoming, handlers } = props;
  const coord = { col, row };
  const className = [
    "cell",
    `cell--${kind}`,
    aim ? "cell--aim" : "",
    incoming ? "cell--incoming" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = { gridRow: row + 1, gridColumn: col + 1 };
  const name = `${coordLabel(coord)}, ${label}`;
  const tag = aim ? <span className="cell__tag">{coordLabel(coord)}</span> : null;
  if (!props.interactive) {
    return (
      <div
        role="img"
        className={className}
        style={style}
        data-coord={`${col}:${row}`}
        aria-label={name}
      >
        {tag}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-coord={`${col}:${row}`}
      aria-label={name}
      aria-disabled={props.locked || undefined}
      tabIndex={props.focusable ? 0 : -1}
      onClick={() => handlers.click(coord)}
      onPointerDown={(event) => handlers.pointerDown(coord, event)}
      onMouseEnter={() => handlers.point(coord)}
      onFocus={() => handlers.focus(coord)}
    >
      {tag}
    </button>
  );
});

/**
 * Grid of cells. Interactive boards use real buttons with a roving tab stop: arrows move,
 * Enter/Space activate, so keyboard and screen readers get it for free.
 * Ship silhouettes sit in the same CSS grid, under the cell layer.
 */
export function Board({
  size,
  label,
  variant,
  cellAt,
  ships = [],
  aim = null,
  incoming = null,
  onActivate,
  onPoint,
  onCellPointerDown,
  locked,
  className,
}: BoardProps) {
  const [focus, setFocus] = useState<Coord>({ col: 0, row: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const interactive = onActivate !== undefined;

  const moveFocus = (next: Coord) => {
    setFocus(next);
    onPoint?.(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-coord="${next.col}:${next.row}"]`)
      ?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const step = delta[event.key];
    if (!step) return;
    event.preventDefault();
    moveFocus({
      col: Math.min(size - 1, Math.max(0, focus.col + step[0])),
      row: Math.min(size - 1, Math.max(0, focus.row + step[1])),
    });
  };

  // Handlers change on every parent render; cells get stable callbacks that read the latest ones.
  const handlers = useRef({ onActivate, onPoint, onCellPointerDown, locked });
  handlers.current = { onActivate, onPoint, onCellPointerDown, locked };
  const cellHandlers = useMemo<CellHandlers>(
    () => ({
      click: (coord) => {
        setFocus(coord);
        if (!handlers.current.locked) handlers.current.onActivate?.(coord);
      },
      pointerDown: (coord, event) => handlers.current.onCellPointerDown?.(coord, event),
      point: (coord) => handlers.current.onPoint?.(coord),
      focus: (coord) => {
        setFocus(coord);
        handlers.current.onPoint?.(coord);
      },
    }),
    [],
  );

  const cells = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const coord = { col, row };
      const view = cellAt(coord);
      cells.push(
        <Cell
          key={`${col}:${row}`}
          col={col}
          row={row}
          kind={view.kind}
          label={view.label}
          aim={aim !== null && sameCoord(aim, coord)}
          incoming={incoming !== null && sameCoord(incoming, coord)}
          interactive={interactive}
          focusable={focus.col === col && focus.row === row}
          locked={Boolean(locked)}
          handlers={cellHandlers}
        />,
      );
    }
  }

  const columnLabels = Array.from({ length: size }, (_, col) => columnLetter(col));
  const rowLabels = Array.from({ length: size }, (_, row) => String(row + 1));

  return (
    <div
      className={["board", `board--${variant}`, className].filter(Boolean).join(" ")}
      style={{ "--size": size } as CSSProperties}
    >
      <div className="board__cols" aria-hidden="true">
        {columnLabels.map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>
      <div className="board__rows" aria-hidden="true">
        {rowLabels.map((number) => (
          <span key={number}>{number}</span>
        ))}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset cannot host the CSS grid layout reliably */}
      <div
        ref={gridRef}
        className="board__grid"
        role="group"
        aria-label={label}
        onKeyDown={interactive ? onKeyDown : undefined}
        onMouseLeave={() => onPoint?.(null)}
      >
        {ships.map((ship) => {
          const { bow, orientation, shipId } = ship.placement;
          const area: CSSProperties =
            orientation === "h"
              ? { gridRow: bow.row + 1, gridColumn: `${bow.col + 1} / span ${ship.length}` }
              : { gridColumn: bow.col + 1, gridRow: `${bow.row + 1} / span ${ship.length}` };
          return (
            <div
              key={shipId}
              className={`ship ship--${ship.state}`}
              style={area}
              aria-hidden="true"
            >
              <ShipSilhouette shipId={shipId} length={ship.length} orientation={orientation} />
            </div>
          );
        })}
        {cells}
      </div>
    </div>
  );
}
