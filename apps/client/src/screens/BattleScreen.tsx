import {
  type Coord,
  coordKey,
  coordLabel,
  type Placement,
  type PlayerView,
  type ShipSpec,
  shipCells,
} from "@battleships/shared";
import { useState } from "react";
import type { GameSnapshot, LogEntry } from "../adapters/localAiGame";
import { Board, type CellView } from "../components/Board";
import { t } from "../i18n/es";

interface BattleScreenProps {
  readonly snapshot: GameSnapshot;
  readonly onFire: (coord: Coord) => void;
  readonly onLeave: () => void;
}

function cellsOf(placements: readonly Placement[], fleet: readonly ShipSpec[]): Set<string> {
  const keys = new Set<string>();
  for (const placement of placements) {
    const length = fleet.find((ship) => ship.id === placement.shipId)?.length ?? 0;
    for (const cell of shipCells(placement, length)) keys.add(coordKey(cell));
  }
  return keys;
}

export function logMessage(entry: LogEntry): string {
  const coord = coordLabel(entry.coord);
  const ship = entry.shipId ? t.ships[entry.shipId] : "";
  if (entry.seat === 0) {
    if (entry.result === "sunk") return t.log.ownSunk(ship, coord);
    return entry.result === "hit" ? t.log.ownHit(coord) : t.log.ownMiss(coord);
  }
  if (entry.result === "sunk") return t.log.enemySunk(ship, coord);
  return entry.result === "hit" ? t.log.enemyHit(coord) : t.log.enemyMiss(coord);
}

function radarCell(view: PlayerView, sunkKeys: Set<string>) {
  return (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (sunkKeys.has(key)) return { kind: "sunk", label: t.cell.sunk };
    const mark = view.opponent.shots[key];
    if (mark === "hit") return { kind: "hit", label: t.cell.hit };
    if (mark === "miss") return { kind: "miss", label: t.cell.miss };
    return { kind: "empty", label: t.cell.empty };
  };
}

function deckCell(view: PlayerView, shipKeys: Set<string>, sunkKeys: Set<string>) {
  return (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (sunkKeys.has(key)) return { kind: "sunk", label: t.cell.sunk };
    const mark = view.ownShotsReceived[key];
    if (mark === "hit") return { kind: "hit", label: t.cell.hit };
    if (mark === "miss") return { kind: "miss", label: t.cell.miss };
    return shipKeys.has(key)
      ? { kind: "ship", label: t.cell.ship }
      : { kind: "empty", label: t.cell.water };
  };
}

export function BattleScreen({ snapshot, onFire, onLeave }: BattleScreenProps) {
  const { view, log, aiThinking } = snapshot;
  const [confirming, setConfirming] = useState(false);
  const rules = view.rules;
  const ownFleet = view.ownFleet ?? [];
  const ownShipKeys = cellsOf(ownFleet, rules.fleet);
  const ownSunkKeys = cellsOf(
    ownFleet.filter((p) => view.ownSunk.some((ship) => ship.id === p.shipId)),
    rules.fleet,
  );
  const enemySunkKeys = cellsOf(view.opponent.sunkShips, rules.fleet);
  const myTurn = view.phase === "battle" && view.turn === view.you && !aiThinking;
  const lastEntry = log.at(-1);

  const ownStatus = rules.fleet.map((ship) => {
    const placement = ownFleet.find((p) => p.shipId === ship.id);
    const sunk = view.ownSunk.some((s) => s.id === ship.id);
    const damaged =
      placement !== undefined &&
      shipCells(placement, ship.length).some(
        (cell) => view.ownShotsReceived[coordKey(cell)] === "hit",
      );
    return { ship, state: sunk ? "sunk" : damaged ? "damaged" : "intact" } as const;
  });
  const enemyStatus = rules.fleet.map((ship) => {
    const sunk = view.opponent.sunkShips.some((p) => p.shipId === ship.id);
    return { ship, state: sunk ? "sunk" : "unconfirmed" } as const;
  });

  return (
    <main className="screen battle">
      <div className={`turn${myTurn ? "" : " turn--enemy"}`} role="status">
        <span className="turn__dot" aria-hidden="true" />
        {myTurn ? t.battle.yourTurn : aiThinking ? t.battle.aiThinking : t.battle.enemyTurn}
      </div>

      <div className="battle__layout">
        <FleetPanel
          title={`${t.battle.ownFleet} · ${rules.fleet.length - view.ownSunk.length}/${rules.fleet.length} ${t.battle.afloat}`}
          items={ownStatus}
        />

        <div className="battle__boards">
          <section aria-labelledby="radar-title">
            <h2 id="radar-title" className="board-title">
              {t.battle.radar}
            </h2>
            <Board
              size={rules.boardSize}
              label={t.battle.radar}
              variant="radar"
              cellAt={radarCell(view, enemySunkKeys)}
              onActivate={onFire}
              locked={!myTurn}
            />
          </section>
          <section aria-labelledby="deck-title">
            <h2 id="deck-title" className="board-title">
              {t.battle.deck}
            </h2>
            <Board
              size={rules.boardSize}
              label={t.battle.deck}
              variant="deck"
              cellAt={deckCell(view, ownShipKeys, ownSunkKeys)}
            />
          </section>
        </div>

        <div className="battle__side">
          <FleetPanel
            title={`${t.battle.enemyFleet} · ${view.opponent.remainingShips.length}/${rules.fleet.length} ${t.battle.afloat}`}
            items={enemyStatus}
          />
          <section className="panel" aria-labelledby="log-title">
            <h2 id="log-title" className="label">
              {t.battle.log}
            </h2>
            <ol className="log">
              {log
                .slice(-10)
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.id}
                    className={`log__entry log__entry--${entry.result} log__entry--seat${entry.seat}`}
                  >
                    {logMessage(entry)}
                  </li>
                ))}
            </ol>
          </section>
          {confirming ? (
            <div className="confirm" role="alertdialog" aria-label={t.battle.confirmLeave}>
              <p>{t.battle.confirmLeave}</p>
              <button type="button" onClick={onLeave}>
                {t.battle.confirmYes}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                {t.battle.confirmNo}
              </button>
            </div>
          ) : (
            <button type="button" className="ghost" onClick={() => setConfirming(true)}>
              {t.battle.leave}
            </button>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="assertive">
        {lastEntry ? logMessage(lastEntry) : ""}
      </p>
    </main>
  );
}

type FleetState = "intact" | "damaged" | "sunk" | "unconfirmed";

function FleetPanel({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly { ship: ShipSpec; state: FleetState }[];
}) {
  const labels: Record<FleetState, string> = {
    intact: t.battle.intact,
    damaged: t.battle.damaged,
    sunk: t.battle.sunk,
    unconfirmed: t.battle.unconfirmed,
  };
  return (
    <section className="panel fleet">
      <h2 className="label">{title}</h2>
      <ul>
        {items.map(({ ship, state }) => (
          <li key={ship.id} className={`fleet__item fleet__item--${state}`}>
            <span>
              {t.ships[ship.id]} <span className="num dim">({ship.length})</span>
            </span>
            <span className="fleet__state">{labels[state]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
