import {
  type Coord,
  coordKey,
  type Placement,
  type ShipSpec,
  shipCells,
} from "@battleships/shared";
import type { GameSnapshot } from "../adapters/localAiGame";
import { Board, type CellView } from "../components/Board";
import { t } from "../i18n/es";

interface ResultsScreenProps {
  readonly snapshot: GameSnapshot;
  readonly onPlayAgain: () => void;
  readonly onMenu: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function revealedCell(
  fleet: readonly Placement[],
  specs: readonly ShipSpec[],
  shots: Readonly<Record<string, "miss" | "hit">>,
) {
  const ships = new Set<string>();
  for (const placement of fleet) {
    const length = specs.find((ship) => ship.id === placement.shipId)?.length ?? 0;
    for (const cell of shipCells(placement, length)) ships.add(coordKey(cell));
  }
  return (coord: Coord): CellView => {
    const key = coordKey(coord);
    const mark = shots[key];
    if (mark === "hit") return { kind: "hit", label: t.cell.hit };
    if (mark === "miss") return { kind: "miss", label: t.cell.miss };
    return ships.has(key)
      ? { kind: "ship", label: t.cell.ship }
      : { kind: "empty", label: t.cell.water };
  };
}

export function ResultsScreen({ snapshot, onPlayAgain, onMenu }: ResultsScreenProps) {
  const { view, stats, revealedEnemyFleet } = snapshot;
  const won = view.winner === view.you;
  const forfeited = !won && view.ownSunk.length < view.rules.fleet.length;
  const text = won
    ? t.results.victoryText
    : forfeited
      ? t.results.forfeitText
      : t.results.defeatText;

  return (
    <main className="screen results">
      <h1 className={`results__title${won ? " is-victory" : ""}`}>
        {won ? t.results.victory : t.results.defeat}
      </h1>
      <p>{text}</p>
      <dl className="results__stats">
        <div>
          <dt className="label">{t.results.shots}</dt>
          <dd className="num">{stats.shots}</dd>
        </div>
        <div>
          <dt className="label">{t.results.accuracy}</dt>
          <dd className="num">{Math.round(stats.accuracy * 100)}%</dd>
        </div>
        <div>
          <dt className="label">{t.results.streak}</dt>
          <dd className="num">{stats.maxStreak}</dd>
        </div>
        <div>
          <dt className="label">{t.results.firstSink}</dt>
          <dd className="num">{stats.firstSinkTurn ?? t.results.firstSinkNone}</dd>
        </div>
        <div>
          <dt className="label">{t.results.duration}</dt>
          <dd className="num">{formatDuration(stats.durationMs)}</dd>
        </div>
      </dl>

      <h2 className="label">{t.results.finalMaps}</h2>
      <div className="battle__boards">
        <Board
          size={view.rules.boardSize}
          label={t.battle.radar}
          variant="radar"
          cellAt={revealedCell(revealedEnemyFleet ?? [], view.rules.fleet, view.opponent.shots)}
        />
        <Board
          size={view.rules.boardSize}
          label={t.battle.deck}
          variant="deck"
          cellAt={revealedCell(view.ownFleet ?? [], view.rules.fleet, view.ownShotsReceived)}
        />
      </div>

      <div className="results__actions">
        <button type="button" className="primary" onClick={onPlayAgain}>
          {t.results.playAgain}
        </button>
        <button type="button" onClick={onMenu}>
          {t.results.menu}
        </button>
      </div>
    </main>
  );
}
