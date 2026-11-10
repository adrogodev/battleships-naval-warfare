import {
  type Coord,
  coordKey,
  type Placement,
  type ShipSpec,
  shipCells,
} from "@battleships/shared";
import type { ReactNode } from "react";
import type { GameSnapshot } from "../adapters/localAiGame";
import { Board, type BoardShip, type CellView } from "../components/Board";
import { ChallengeBadge, RankBadge } from "../components/RankBadge";
import { t } from "../i18n/es";
import type { ProgressReport } from "../progress/progress";

interface ResultsScreenProps {
  readonly snapshot: GameSnapshot;
  /** "Jugar otra vez" (local games); omitted in multiplayer, where `extra` holds the rematch. */
  readonly onPlayAgain?: () => void;
  readonly onMenu: () => void;
  /** Overrides the result sentence (e.g. the rival abandoned). */
  readonly summary?: string;
  readonly extra?: ReactNode;
  /** What this game added to the commander's progression (XP, promotion, challenges). */
  readonly progress?: ProgressReport | null;
}

const XP_PARTS = ["participation", "victory", "accuracy", "sinkings"] as const;

function ProgressPanel({ report }: { readonly report: ProgressReport }) {
  const rankName = t.progress.ranks[report.rankAfter.id];
  return (
    <section className="panel results__progress" aria-labelledby="progress-title">
      <h2 id="progress-title" className="label">
        {t.results.progressTitle}
      </h2>
      <div className="results__rank">
        <RankBadge index={report.rankAfter.index} className="results__badge" />
        <p>
          <span className="num results__xp">{t.results.xpGained(report.xp.total)}</span>
          <br />
          {report.rankUp ? (
            <strong className="results__rankup">{t.results.rankUp(rankName)}</strong>
          ) : (
            t.results.currentRank(rankName)
          )}
        </p>
      </div>
      <dl className="results__xp-parts">
        {XP_PARTS.map((part) => (
          <div key={part}>
            <dt className="label">{t.results.xpParts[part]}</dt>
            <dd className="num">{t.results.xpGained(report.xp[part])}</dd>
          </div>
        ))}
      </dl>
      {report.newChallenges.length > 0 && (
        <>
          <h3 className="label">{t.results.newChallenges}</h3>
          <ul className="challenges challenges--new">
            {report.newChallenges.map((id) => (
              <li key={id} className="challenge is-completed">
                <ChallengeBadge completed />
                <span>
                  <strong>{t.progress.challenges[id].badge}</strong>
                  <br />
                  <span className="dim">{t.progress.challenges[id].title}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Final map: every ship revealed, sunk ones marked, plus all shots. */
function revealedBoard(
  fleet: readonly Placement[],
  specs: readonly ShipSpec[],
  shots: Readonly<Record<string, "miss" | "hit">>,
  sunk: ReadonlySet<string>,
) {
  const shipKeys = new Set<string>();
  const ships: BoardShip[] = fleet.map((placement) => {
    const length = specs.find((ship) => ship.id === placement.shipId)?.length ?? 0;
    const cells = shipCells(placement, length);
    for (const cell of cells) shipKeys.add(coordKey(cell));
    const isSunk = sunk.has(placement.shipId);
    const damaged = cells.some((cell) => shots[coordKey(cell)] === "hit");
    return { placement, length, state: isSunk ? "sunk" : damaged ? "damaged" : "intact" };
  });
  const cellAt = (coord: Coord): CellView => {
    const key = coordKey(coord);
    const mark = shots[key];
    if (mark) return { kind: mark, label: t.cell[mark] };
    return { kind: "empty", label: shipKeys.has(key) ? t.cell.ship : t.cell.water };
  };
  return { ships, cellAt };
}

export function ResultsScreen({
  snapshot,
  onPlayAgain,
  onMenu,
  summary,
  extra,
  progress,
}: ResultsScreenProps) {
  const { view, stats, revealedEnemyFleet } = snapshot;
  const won = view.winner === view.you;
  const forfeited = !won && view.ownSunk.length < view.rules.fleet.length;
  let text: string = t.results.defeatText;
  if (won) text = t.results.victoryText;
  else if (forfeited) text = t.results.forfeitText;

  const enemy = revealedBoard(
    revealedEnemyFleet ?? [],
    view.rules.fleet,
    view.opponent.shots,
    new Set(view.opponent.sunkShips.map((p) => p.shipId)),
  );
  const own = revealedBoard(
    view.ownFleet ?? [],
    view.rules.fleet,
    view.ownShotsReceived,
    new Set(view.ownSunk.map((s) => s.id)),
  );

  return (
    <main className="screen results">
      <h1 className={`results__title${won ? " is-victory" : ""}`}>
        {won ? t.results.victory : t.results.defeat}
      </h1>
      <p>{summary ?? text}</p>
      <dl className="results__stats panel">
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

      {progress && <ProgressPanel report={progress} />}

      <h2 className="label">{t.results.finalMaps}</h2>
      <div className="battle__boards">
        <Board
          size={view.rules.boardSize}
          label={t.battle.radar}
          variant="radar"
          className="board--revealed"
          cellAt={enemy.cellAt}
          ships={enemy.ships}
        />
        <Board
          size={view.rules.boardSize}
          label={t.battle.deck}
          variant="deck"
          cellAt={own.cellAt}
          ships={own.ships}
        />
      </div>

      <div className="results__actions">
        {extra}
        {onPlayAgain && (
          <button type="button" className="primary" onClick={onPlayAgain}>
            {t.results.playAgain}
          </button>
        )}
        <button type="button" onClick={onMenu}>
          {t.results.menu}
        </button>
      </div>
    </main>
  );
}
