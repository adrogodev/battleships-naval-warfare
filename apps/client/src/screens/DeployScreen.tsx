import {
  type Coord,
  coordKey,
  createRng,
  type GameRules,
  type Placement,
  type PlacementCheck,
  type ShipId,
  shipCells,
} from "@battleships/shared";
import { useEffect, useMemo, useState } from "react";
import { Board, type CellView } from "../components/Board";
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
}

export function DeployScreen({ rules, onReady }: DeployScreenProps) {
  const [state, setState] = useState<DeployState>(() => initialDeploy(rules));
  const [pointer, setPointer] = useState<Coord | null>(null);
  const [lastCheck, setLastCheck] = useState<PlacementCheck | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") {
        setState((current) => rotate(current));
      } else if (event.key === "Escape") {
        setState((current) => cancelSelection(current));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const occupied = useMemo(() => {
    const map = new Map<string, ShipId>();
    for (const placement of state.placed) {
      const length = rules.fleet.find((ship) => ship.id === placement.shipId)?.length ?? 0;
      for (const cell of shipCells(placement, length)) map.set(coordKey(cell), placement.shipId);
    }
    return map;
  }, [state.placed, rules]);

  const ghost = pointer ? preview(state, pointer, rules) : null;
  const ghostKeys = new Set(ghost?.cells.map(coordKey));

  const cellAt = (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (ghostKeys.has(key)) {
      return ghost?.check.ok
        ? { kind: "ghost-ok", label: t.deploy.validHere }
        : {
            kind: "ghost-bad",
            label: t.deploy.reasons[ghost?.check.ok === false ? ghost.check.reason : "overlap"],
          };
    }
    const shipId = occupied.get(key);
    return shipId
      ? { kind: "ship", label: t.ships[shipId] }
      : { kind: "empty", label: t.cell.water };
  };

  const onActivate = (coord: Coord) => {
    const shipId = occupied.get(coordKey(coord));
    if (shipId) {
      setState(select(state, shipId));
      setLastCheck(null);
      return;
    }
    const result = placeAt(state, coord, rules);
    setState(result.state);
    setLastCheck(result.check);
  };

  const status = (() => {
    const check = ghost?.check ?? lastCheck;
    if (!check) return "";
    return check.ok ? t.deploy.validHere : t.deploy.reasons[check.reason];
  })();
  const ready = isFleetReady(state, rules);

  return (
    <main className="screen deploy">
      <h1 className="screen__title">{t.deploy.title}</h1>
      <p className="hint">{t.deploy.help}</p>
      <div className="deploy__layout">
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
                    className={`dock__ship${isSelected ? " is-selected" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => setState(select(state, ship.id))}
                  >
                    <span>
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
            <button type="button" onClick={() => setState(rotate(state))}>
              {t.deploy.rotate} ·{" "}
              {state.orientation === "h" ? t.deploy.horizontal : t.deploy.vertical}
            </button>
            <button type="button" onClick={() => setState(randomize(rules, createRng(Date.now())))}>
              {t.deploy.random}
            </button>
            <button type="button" onClick={() => setState(initialDeploy(rules))}>
              {t.deploy.reset}
            </button>
          </div>
        </section>
        <section className="deploy__board">
          <Board
            size={rules.boardSize}
            label={t.deploy.boardLabel}
            variant="deck"
            cellAt={cellAt}
            onActivate={onActivate}
            onPoint={setPointer}
          />
          <p
            className={`status${ghost && !ghost.check.ok ? " status--bad" : ""}`}
            aria-live="polite"
          >
            {status}
          </p>
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
    </main>
  );
}
