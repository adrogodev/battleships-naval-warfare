import { type Coord, columnLetter, coordLabel } from "@battleships/shared";
import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";

export type CellKind = "empty" | "ship" | "miss" | "hit" | "sunk" | "ghost-ok" | "ghost-bad";

export interface CellView {
  readonly kind: CellKind;
  /** Accessible state, e.g. "impacto". The coordinate is prepended by the board. */
  readonly label: string;
}

interface BoardProps {
  readonly size: number;
  readonly label: string;
  readonly variant: "deck" | "radar";
  readonly cellAt: (coord: Coord) => CellView;
  /** When omitted the board is display-only. */
  readonly onActivate?: (coord: Coord) => void;
  readonly onPoint?: (coord: Coord | null) => void;
  /** Interactive board that currently ignores activation (e.g. not your turn). */
  readonly locked?: boolean;
}

/**
 * Grid of cells. Interactive boards use real buttons with a roving tab stop:
 * arrows move, Enter/Space activate, so keyboard and screen readers get it for free.
 */
export function Board({ size, label, variant, cellAt, onActivate, onPoint, locked }: BoardProps) {
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

  const cells = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const coord = { col, row };
      const view = cellAt(coord);
      const name = `${coordLabel(coord)}, ${view.label}`;
      const className = `cell cell--${view.kind}`;
      cells.push(
        interactive ? (
          <button
            key={`${col}:${row}`}
            type="button"
            className={className}
            data-coord={`${col}:${row}`}
            aria-label={name}
            aria-disabled={locked || undefined}
            tabIndex={focus.col === col && focus.row === row ? 0 : -1}
            onClick={() => {
              setFocus(coord);
              if (!locked) onActivate(coord);
            }}
            onMouseEnter={() => onPoint?.(coord)}
            onFocus={() => {
              setFocus(coord);
              onPoint?.(coord);
            }}
          />
        ) : (
          <div key={`${col}:${row}`} role="img" className={className} aria-label={name} />
        ),
      );
    }
  }

  const columnLabels = Array.from({ length: size }, (_, col) => columnLetter(col));
  const rowLabels = Array.from({ length: size }, (_, row) => String(row + 1));

  return (
    <div className={`board board--${variant}`} style={{ "--size": size } as CSSProperties}>
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
        {cells}
      </div>
    </div>
  );
}
