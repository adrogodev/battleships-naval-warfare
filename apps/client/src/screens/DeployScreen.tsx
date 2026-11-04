import {
  type Coord,
  coordKey,
  createRng,
  type GameRules,
  type Placement,
  type PlacementCheck,
  type ShipId,
  shipCells,
  validatePlacement,
} from "@battleships/shared";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SfxId } from "../audio";
import { Board, type BoardShip, type CellView } from "../components/Board";
import { ShipSilhouette } from "../components/ShipSilhouette";
import {
  cancelSelection,
  type DeployState,
  initialDeploy,
  isFleetReady,
  placeAt,
  preview,
  randomize,
  rotate,
  select,
} from "../deploy/deployModel";
import { t } from "../i18n/es";

interface DeployScreenProps {
  readonly rules: GameRules;
  readonly onReady: (fleet: readonly Placement[]) => void;
  readonly play: (id: SfxId) => void;
}

const DOUBLE_TAP_MS = 350;
const DRAG_THRESHOLD_PX = 6;

interface Drag {
  readonly shipId: ShipId;
  readonly startX: number;
  readonly startY: number;
  readonly fromBoard: boolean;
  active: boolean;
}

/** Board cell under a viewport point, if it belongs to the deployment board. */
function coordAt(x: number, y: number): Coord | null {
  const element = document.elementFromPoint(x, y)?.closest("[data-board='deploy'] [data-coord]");
  const value = element?.getAttribute("data-coord");
  if (!value) return null;
  const [col, row] = value.split(":").map(Number);
  return col === undefined || row === undefined ? null : { col, row };
}

export function DeployScreen({ rules, onReady, play }: DeployScreenProps) {
  const [state, setState] = useState<DeployState>(() => initialDeploy(rules));
  const [pointer, setPointer] = useState<Coord | null>(null);
  const [lastCheck, setLastCheck] = useState<PlacementCheck | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const lastLift = useRef<{ placement: Placement; at: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") setState((current) => rotate(current));
      else if (event.key === "Escape") setState((current) => cancelSelection(current));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lengthOf = (shipId: ShipId) => rules.fleet.find((ship) => ship.id === shipId)?.length ?? 0;

  const occupied = useMemo(() => {
    const map = new Map<string, Placement>();
    for (const placement of state.placed) {
      const length = rules.fleet.find((ship) => ship.id === placement.shipId)?.length ?? 0;
      for (const cell of shipCells(placement, length)) map.set(coordKey(cell), placement);
    }
    return map;
  }, [state.placed, rules]);

  const ghost = pointer ? preview(state, pointer, rules) : null;
  const ghostKeys = new Set(ghost?.cells.map(coordKey));

  const cellAt = (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (ghost && ghostKeys.has(key)) {
      return ghost.check.ok
        ? { kind: "ghost-ok", label: t.deploy.validHere }
        : { kind: "ghost-bad", label: t.deploy.reasons[ghost.check.reason] };
    }
    const placement = occupied.get(key);
    return placement
      ? { kind: "empty", label: t.ships[placement.shipId] }
      : { kind: "empty", label: t.cell.water };
  };

  const placeSelected = (current: DeployState, coord: Coord) => {
    const result = placeAt(current, coord, rules);
    setState(result.state);
    setLastCheck(result.check);
    if (result.check?.ok) play("place");
  };

  const onActivate = (coord: Coord) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // Second tap on a ship just lifted: rotate it in place instead of moving it.
    const lift = lastLift.current;
    if (
      lift &&
      performance.now() - lift.at < DOUBLE_TAP_MS &&
      state.selected === lift.placement.shipId
    ) {
      lastLift.current = null;
      const rotated: Placement = {
        ...lift.placement,
        orientation: lift.placement.orientation === "h" ? "v" : "h",
      };
      const ok = validatePlacement(state.placed, rotated, rules).ok;
      const placed = [...state.placed, ok ? rotated : lift.placement];
      setState({ ...state, placed, selected: null, orientation: rotated.orientation });
      setLastCheck(ok ? { ok: true } : validatePlacement(state.placed, rotated, rules));
      play(ok ? "place" : "click");
      return;
    }
    const placement = occupied.get(coordKey(coord));
    if (placement) {
      lastLift.current = { placement, at: performance.now() };
      setState(select(state, placement.shipId));
      setLastCheck(null);
      play("click");
      return;
    }
    placeSelected(state, coord);
  };

  // Drag and drop (mouse and touch) through pointer events.
  const startDrag = (shipId: ShipId, event: PointerEvent<HTMLElement>, fromBoard: boolean) => {
    if (event.button !== 0) return;
    drag.current = {
      shipId,
      startX: event.clientX,
      startY: event.clientY,
      fromBoard,
      active: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current) return;
    if (!current.active) {
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (moved < DRAG_THRESHOLD_PX) return;
      current.active = true;
      setState((s) => select(s, current.shipId));
    }
    setDragGhost({ x: event.clientX, y: event.clientY });
    setPointer(coordAt(event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current?.active) return;
    suppressClick.current = true;
    setDragGhost(null);
    const coord = coordAt(event.clientX, event.clientY);
    if (coord) placeSelected(state, coord);
    // Let the click that follows pointerup pass after this tick.
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const ships: BoardShip[] = state.placed.map((placement) => ({
    placement,
    length: lengthOf(placement.shipId),
    state: "intact",
  }));
  const status = (() => {
    const check = ghost?.check ?? lastCheck;
    if (!check) return "";
    return check.ok ? t.deploy.validHere : t.deploy.reasons[check.reason];
  })();
  const ready = isFleetReady(state, rules);
  const dragging = state.selected && dragGhost ? state.selected : null;

  return (
    <main className="screen deploy" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <h1 className="screen__title">{t.deploy.title}</h1>
      <p className="hint">{t.deploy.help}</p>
      <div className="deploy__layout">
        <section className="deploy__board" data-board="deploy">
          <Board
            size={rules.boardSize}
            label={t.deploy.boardLabel}
            variant="deck"
            cellAt={cellAt}
            ships={ships}
            onActivate={onActivate}
            onPoint={(coord) => {
              if (!drag.current?.active) setPointer(coord);
            }}
            onCellPointerDown={(coord, event) => {
              const placement = occupied.get(coordKey(coord));
              if (placement) startDrag(placement.shipId, event, true);
            }}
          />
          <p
            className={`status${ghost && !ghost.check.ok ? " status--bad" : ""}`}
            aria-live="polite"
          >
            {status}
          </p>
        </section>
        <section className="panel dock" aria-labelledby="dock-title">
          <h2 id="dock-title" className="label">
            {t.deploy.dock}
          </h2>
          <ul className="dock__list">
            {rules.fleet.map((ship) => {
              const onBoard = state.placed.some((p) => p.shipId === ship.id);
              const isSelected = state.selected === ship.id;
              return (
                <li key={ship.id}>
                  <button
                    type="button"
                    className={`dock__ship${isSelected ? " is-selected" : ""}${onBoard ? " is-placed" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (suppressClick.current) return;
                      setState(select(state, ship.id));
                      play("click");
                    }}
                    onPointerDown={(event) => startDrag(ship.id, event, false)}
                  >
                    <span className="dock__silhouette" style={{ width: `${ship.length * 18}px` }}>
                      <ShipSilhouette shipId={ship.id} length={ship.length} />
                    </span>
                    <span className="dock__name">
                      {t.ships[ship.id]} <span className="num dim">({ship.length})</span>
                    </span>
                    <span className="dock__state">
                      {isSelected
                        ? t.deploy.selected
                        : onBoard
                          ? t.deploy.onBoard
                          : t.deploy.inDock}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="dock__actions">
            <button
              type="button"
              onClick={() => {
                setState(rotate(state));
                play("click");
              }}
            >
              {t.deploy.rotate} ·{" "}
              {state.orientation === "h" ? t.deploy.horizontal : t.deploy.vertical}
            </button>
            <button
              type="button"
              onClick={() => {
                setState(randomize(rules, createRng(Date.now())));
                setLastCheck(null);
                play("place");
              }}
            >
              {t.deploy.random}
            </button>
            <button
              type="button"
              onClick={() => {
                setState(initialDeploy(rules));
                setLastCheck(null);
                play("click");
              }}
            >
              {t.deploy.reset}
            </button>
          </div>
          <button
            type="button"
            className="primary"
            disabled={!ready}
            onClick={() => onReady(state.placed)}
          >
            {t.deploy.ready}
          </button>
        </section>
      </div>
      {dragging && dragGhost && (
        <div
          className="drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y, width: `${lengthOf(dragging) * 24}px` }}
          aria-hidden="true"
        >
          <ShipSilhouette shipId={dragging} length={lengthOf(dragging)} orientation="h" />
        </div>
      )}
    </main>
  );
}
