import {
  type Coord,
  coordKey,
  coordLabel,
  type Difficulty,
  type Placement,
  type ShipSpec,
  sameCoord,
  shipCells,
} from "@battleships/shared";
import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { GameSnapshot, LogEntry } from "../adapters/localAiGame";
import type { HapticCue } from "../app/haptics";
import type { MusicIntensity, SfxId } from "../audio";
import { currentStreak, musicIntensity, presentBoard } from "../battle/presentation";
import { Board, type BoardShip, type CellView } from "../components/Board";
import { Insignia } from "../components/Insignia";
import { burstPreset, fxBus } from "../fx/particles/bursts";
import { t } from "../i18n/es";
import {
  type CommanderMoment,
  commanderComment,
  commanderMomentAfterSink,
} from "../narrative/commander";
import { commsLine } from "../narrative/narrative";
import { type ShotPhase, ShotQueue } from "../sequence/shotQueue";
import type { MotionTokens } from "../theme/motion";

export type BattleOpponent =
  | { readonly kind: "ai"; readonly difficulty: Difficulty }
  | { readonly kind: "human"; readonly alias: string };

export interface BattleEffects {
  readonly play: (id: SfxId) => void;
  readonly setIntensity: (level: MusicIntensity) => void;
  readonly vibrate: (cue: HapticCue) => void;
}

interface BattleScreenProps {
  readonly snapshot: GameSnapshot;
  readonly operation: string;
  /** Rival: an AI commander (header insignia and transmissions) or a human player. */
  readonly opponent: BattleOpponent;
  /** Multiplayer layer (turn banner, timer, disconnection, reactions), rendered over the battle. */
  readonly live?: ReactNode;
  /** Firing is disabled while the match is frozen (e.g. a player lost the connection). */
  readonly frozen?: boolean;
  /** Show the commander's brief comments on key moments. */
  readonly commanderComments: boolean;
  readonly motion: MotionTokens;
  readonly reducedMotion: boolean;
  readonly confirmShot: boolean;
  readonly compact: boolean;
  readonly showBlocked: boolean;
  readonly effects: BattleEffects;
  readonly onFire: (coord: Coord) => void;
  readonly onLeave: () => void;
  /** Called once the final shot has played and the victory/defeat banner is over. */
  readonly onFinished: () => void;
}

/** How long a commander transmission stays on screen. */
const TRANSMISSION_MS = 2500;

const lengthOf = (fleet: readonly ShipSpec[], shipId: string) =>
  fleet.find((ship) => ship.id === shipId)?.length ?? 0;

function cellCenter(board: "radar" | "deck", coord: Coord): { x: number; y: number } | null {
  const element = document.querySelector(
    `[data-board="${board}"] [data-coord="${coord.col}:${coord.row}"]`,
  );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function BattleScreen(props: BattleScreenProps) {
  const { snapshot, effects } = props;
  const { view, log, aiThinking, stats } = snapshot;
  const rules = view.rules;

  // Latest props for timer callbacks, without re-creating the queue.
  const latest = useRef(props);
  latest.current = props;

  const [caption, setCaption] = useState<{ id: number; text: string } | null>(null);
  const [shake, setShake] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [tab, setTab] = useState<"radar" | "deck">("radar");
  const [aim, setAim] = useState<Coord | null>(null);
  const [pointer, setPointer] = useState<Coord | null>(null);
  const [finale, setFinale] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [transmission, setTransmission] = useState<{ id: number; text: string } | null>(null);

  const onPhaseRef = useRef<(entry: LogEntry, phase: ShotPhase) => void>(() => {});
  const [queue] = useState(() => {
    const created = new ShotQueue({
      motion: () => latest.current.motion,
      onPhase: (entry, phase) => onPhaseRef.current(entry, phase),
    });
    // Mounting into a battle already in progress (reload, reconnect): show its history at once.
    created.adopt(props.snapshot.log);
    return created;
  });
  const presented = useSyncExternalStore(queue.subscribe, queue.getSnapshot);

  const sound = (id: SfxId) => {
    latest.current.effects.play(id);
    if (id === "click") return;
    setCaption((previous) => ({ id: (previous?.id ?? 0) + 1, text: t.captions[id] }));
  };

  const comment = (moment: CommanderMoment, variant: number) => {
    const { commanderComments, opponent } = latest.current;
    if (!commanderComments || opponent.kind !== "ai") return;
    const text = commanderComment(opponent.difficulty, moment, variant);
    setTransmission((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
  };

  onPhaseRef.current = (entry, phase) => {
    const board = entry.seat === 0 ? "radar" : "deck";
    if (phase === "fire") {
      sound("fire");
      if (!latest.current.reducedMotion) setShake((n) => n + 1);
    } else if (phase === "suspense") {
      sound("whistle");
    } else if (phase === "impact") {
      sound(entry.result === "miss" ? "miss" : "hit");
      const center = cellCenter(board, entry.coord);
      if (center) {
        const kind = entry.result === "miss" ? "miss" : "hit";
        for (const burst of burstPreset(kind, center.x, center.y)) fxBus.emit(burst);
      }
      if (entry.seat === 1 && entry.result !== "miss")
        latest.current.effects.vibrate("hitReceived");
    } else if (phase === "sunk") {
      sound("sunk");
      const center = cellCenter(board, entry.coord);
      if (center) for (const burst of burstPreset("sunk", center.x, center.y)) fxBus.emit(burst);
      if (entry.seat === 1) latest.current.effects.vibrate("ownSunk");
      setBanner(commsLine(entry));
      const { log: fullLog, view: current } = latest.current.snapshot;
      const sunkByShooter = fullLog.filter(
        (e) => e.id <= entry.id && e.seat === entry.seat && e.result === "sunk",
      ).length;
      const moment = commanderMomentAfterSink(
        entry.seat,
        current.rules.fleet.length - sunkByShooter,
      );
      if (moment) comment(moment, entry.id);
    } else if (phase === "done" && latest.current.compact) {
      // Mobile: watch your fleet during the enemy turn, back to the radar for yours.
      setTab(entry.seat === 0 ? "deck" : "radar");
    }
  };

  useEffect(() => {
    queue.sync(log);
  }, [queue, log]);
  useEffect(() => () => queue.dispose(), [queue]);

  // Abandoning ends the battle at once: present everything without waiting.
  const forfeited =
    view.phase === "finished" &&
    view.winner !== view.you &&
    view.ownSunk.length < rules.fleet.length;
  useEffect(() => {
    if (forfeited) queue.skipAll();
  }, [queue, forfeited]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
  }, [banner]);

  // Opening transmission, once per battle.
  useEffect(() => {
    const { commanderComments, opponent, operation } = latest.current;
    if (!commanderComments || opponent.kind !== "ai") return;
    setTransmission({
      id: 1,
      text: commanderComment(opponent.difficulty, "battleStart", operation.length),
    });
  }, []);

  useEffect(() => {
    if (!transmission) return;
    const id = setTimeout(() => setTransmission(null), TRANSMISSION_MS);
    return () => clearTimeout(id);
  }, [transmission]);

  useEffect(() => {
    if (!caption) return;
    const id = setTimeout(() => setCaption(null), 1800);
    return () => clearTimeout(id);
  }, [caption]);

  // Presentation of both boards: only what the sequence already revealed.
  const radar = presentBoard({
    log,
    seat: 0,
    impacted: presented.impacted,
    sunkRevealed: presented.sunkRevealed,
    sunkPlacements: view.opponent.sunkShips,
    rules,
    showBlocked: props.showBlocked,
  });
  const ownFleet = view.ownFleet ?? [];
  const deck = presentBoard({
    log,
    seat: 1,
    impacted: presented.impacted,
    sunkRevealed: presented.sunkRevealed,
    sunkPlacements: ownFleet,
    rules,
    showBlocked: false,
  });
  const ownAfloat = rules.fleet.length - deck.sunkShips.length;
  const enemyAfloat = rules.fleet.length - radar.sunkShips.length;
  const streak = currentStreak(log, presented.impacted);
  const finished = view.phase === "finished" && !presented.busy;
  const myTurn =
    view.phase === "battle" &&
    view.turn === view.you &&
    !aiThinking &&
    !presented.busy &&
    !props.frozen;

  useEffect(() => {
    effects.setIntensity(musicIntensity({ ownAfloat, enemyAfloat, streak }));
  }, [effects, ownAfloat, enemyAfloat, streak]);

  // Turn alert when control comes back to the player.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && presented.impacted > 0) sound("turn");
    wasMyTurn.current = myTurn;
  });

  useEffect(() => {
    if (!finished || finale) return;
    const won = view.winner === view.you;
    setFinale(true);
    sound(won ? "victory" : "defeat");
    if (won) latest.current.effects.vibrate("victory");
    comment(won ? "playerWins" : "aiWins", log.length);
  });
  useEffect(() => {
    if (!finale) return;
    const id = setTimeout(() => latest.current.onFinished(), latest.current.motion.finaleMs);
    return () => clearTimeout(id);
  }, [finale]);

  const fire = (coord: Coord) => {
    if (!myTurn) return;
    if (radar.marks.has(coordKey(coord))) return;
    if (props.confirmShot && (aim === null || !sameCoord(aim, coord))) {
      setAim(coord);
      sound("lock");
      return;
    }
    setAim(null);
    sound("lock");
    props.onFire(coord);
  };

  const cellsOf = (ships: readonly Placement[]) => {
    const keys = new Set<string>();
    for (const ship of ships) {
      for (const cell of shipCells(ship, lengthOf(rules.fleet, ship.shipId))) {
        keys.add(coordKey(cell));
      }
    }
    return keys;
  };
  const radarSunk = cellsOf(radar.sunkShips);
  const deckSunk = cellsOf(deck.sunkShips);
  const ownShipCells = cellsOf(ownFleet);

  const radarCell = (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (radarSunk.has(key)) return { kind: "sunk", label: t.cell.sunk };
    const mark = radar.marks.get(key);
    if (mark) return { kind: mark, label: t.cell[mark] };
    if (radar.blocked.has(key)) return { kind: "blocked", label: t.cell.blocked };
    return { kind: "empty", label: t.cell.empty };
  };
  const deckCell = (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (deckSunk.has(key)) return { kind: "sunk", label: t.cell.sunk };
    const mark = deck.marks.get(key);
    if (mark) return { kind: mark, label: t.cell[mark] };
    return ownShipCells.has(key)
      ? { kind: "empty", label: t.cell.ship }
      : { kind: "empty", label: t.cell.water };
  };

  const deckShips: BoardShip[] = ownFleet.map((placement) => {
    const length = lengthOf(rules.fleet, placement.shipId);
    const sunk = deck.sunkShips.some((p) => p.shipId === placement.shipId);
    const damaged = shipCells(placement, length).some((cell) => deck.marks.has(coordKey(cell)));
    return { placement, length, state: sunk ? "sunk" : damaged ? "damaged" : "intact" };
  });
  const radarShips: BoardShip[] = radar.sunkShips.map((placement) => ({
    placement,
    length: lengthOf(rules.fleet, placement.shipId),
    state: "sunk",
  }));

  const active = presented.active;
  const incoming = active && active.phase === "suspense" ? active.entry : null;
  const won = view.winner === view.you;
  let turnText: string;
  if (finale) turnText = won ? t.finale.victory : t.finale.defeat;
  else if (active) turnText = active.entry.seat === 0 ? t.battle.shotInFlight : t.battle.incoming;
  else if (aiThinking) turnText = t.battle.aiThinking;
  else if (myTurn) turnText = aim ? t.battle.confirmHint : t.battle.yourTurn;
  else turnText = t.battle.enemyTurn;

  const revealed = log.slice(0, presented.impacted);
  const lastRevealed = revealed.at(-1);
  let alert: string | null = null;
  if (enemyAfloat === 1) alert = t.battle.lastShipEnemy;
  else if (ownAfloat === 1) alert = t.battle.lastShipOwn;
  const { opponent } = props;
  const commander = opponent.kind === "ai" ? t.commanders[opponent.difficulty] : null;
  const rivalName = commander ? commander.name : opponent.kind === "human" ? opponent.alias : "";
  const showRadar = !props.compact || tab === "radar";
  const showDeck = !props.compact || tab === "deck";

  return (
    <main className={`screen battle${finale ? " battle--finale" : ""}`}>
      <header className="battle__header panel">
        <div>
          <p className="label">{props.operation}</p>
          <p className="battle__opponent">
            {opponent.kind === "ai" && (
              <Insignia rank={opponent.difficulty} className="battle__insignia" />
            )}
            {t.battle.versus(rivalName)}
          </p>
        </div>
        <div className={`turn${myTurn ? "" : " turn--enemy"}`} role="status">
          <span className="turn__dot" aria-hidden="true" />
          {turnText}
        </div>
        <dl className="battle__stats">
          <div>
            <dt className="label">{t.battle.shots}</dt>
            <dd className="num">{stats.shots}</dd>
          </div>
          <div>
            <dt className="label">{t.battle.accuracy}</dt>
            <dd className="num">{Math.round(stats.accuracy * 100)}%</dd>
          </div>
        </dl>
      </header>

      {props.compact && (
        <div className="viewswitch" role="tablist" aria-label={t.battle.viewSwitch}>
          {(["radar", "deck"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
            >
              {key === "radar" ? t.battle.tabRadar : t.battle.tabDeck}
            </button>
          ))}
        </div>
      )}

      <div className="battle__layout">
        <FleetPanel
          className="battle__own-fleet"
          title={`${t.battle.ownFleet} · ${ownAfloat}/${rules.fleet.length} ${t.battle.afloat}`}
          items={rules.fleet.map((ship) => ({
            ship,
            state: deckShips.find((s) => s.placement.shipId === ship.id)?.state ?? "intact",
          }))}
        />

        <div className="battle__boards">
          {showRadar && (
            <section className="board-wrap" data-board="radar" aria-labelledby="radar-title">
              <h2 id="radar-title" className="board-title">
                {t.battle.radar}
              </h2>
              <Board
                size={rules.boardSize}
                label={t.battle.radar}
                variant="radar"
                cellAt={radarCell}
                ships={radarShips}
                aim={aim ?? (myTurn ? pointer : null)}
                incoming={incoming?.seat === 0 ? incoming.coord : null}
                onActivate={fire}
                onPoint={setPointer}
                locked={!myTurn}
              />
            </section>
          )}
          {showDeck && (
            <section
              key={shake}
              className={`board-wrap${shake > 0 ? " is-shaking" : ""}`}
              data-board="deck"
              aria-labelledby="deck-title"
            >
              <h2 id="deck-title" className="board-title">
                {t.battle.deck}
              </h2>
              <Board
                size={rules.boardSize}
                label={t.battle.deck}
                variant="deck"
                cellAt={deckCell}
                ships={deckShips}
                incoming={incoming?.seat === 1 ? incoming.coord : null}
              />
            </section>
          )}
        </div>

        <div className="battle__side">
          <FleetPanel
            title={`${t.battle.enemyFleet} · ${enemyAfloat}/${rules.fleet.length} ${t.battle.afloat}`}
            items={rules.fleet.map((ship) => ({
              ship,
              state: radar.sunkShips.some((p) => p.shipId === ship.id) ? "sunk" : "unconfirmed",
            }))}
          />
          <section className="panel" aria-labelledby="log-title">
            <h2 id="log-title" className="label">
              {t.battle.log}
            </h2>
            {streak >= 3 && (
              <p className="streak" key={streak}>
                ▲ {t.battle.streak(streak)}
              </p>
            )}
            <div className="log__sides">
              <ShotHistory entries={revealed} seat={0} title={t.battle.logOwn} />
              <ShotHistory entries={revealed} seat={1} title={t.battle.logEnemy} />
            </div>
          </section>
          {confirmingLeave ? (
            <div className="confirm panel" role="alertdialog" aria-label={t.battle.confirmLeave}>
              <p>{t.battle.confirmLeave}</p>
              <button type="button" onClick={props.onLeave}>
                {t.battle.confirmYes}
              </button>
              <button type="button" onClick={() => setConfirmingLeave(false)}>
                {t.battle.confirmNo}
              </button>
            </div>
          ) : (
            <button type="button" className="ghost" onClick={() => setConfirmingLeave(true)}>
              {t.battle.leave}
            </button>
          )}
        </div>
      </div>

      {props.live}
      {alert && !finale && (
        <p className="alert" role="note">
          {alert}
        </p>
      )}
      {banner && <p className="banner">{banner}</p>}
      {caption && (
        <p className="caption" key={caption.id} aria-hidden="true">
          [{caption.text}]
        </p>
      )}
      {finale && (
        <div className={`finale${won ? " finale--victory" : ""}`}>
          <p>{won ? t.finale.victory : t.finale.defeat}</p>
        </div>
      )}
      <div className="transmission-live" aria-live="polite">
        {transmission && opponent.kind === "ai" && commander && (
          <aside
            key={transmission.id}
            className="transmission panel"
            aria-label={t.commander.transmission}
          >
            <Insignia rank={opponent.difficulty} className="transmission__insignia" />
            <p className="transmission__body">
              <span className="label">
                {t.commander.transmission} · {commander.name}
              </span>
              <span className="transmission__line">{transmission.text}</span>
            </p>
          </aside>
        )}
      </div>
      <p className="sr-only" aria-live="assertive">
        {lastRevealed ? commsLine(lastRevealed) : ""}
      </p>
    </main>
  );
}

/** Shots kept per side in the combat log. */
const HISTORY_PER_SIDE = 10;

/** Last shots of one side, newest first, each with its coordinate and result. */
function ShotHistory({
  entries,
  seat,
  title,
}: {
  readonly entries: readonly LogEntry[];
  readonly seat: 0 | 1;
  readonly title: string;
}) {
  const id = useId();
  const shots = entries
    .filter((entry) => entry.seat === seat)
    .slice(-HISTORY_PER_SIDE)
    .reverse();
  return (
    <div className="log__side">
      <h3 id={id} className="label log__title">
        {title}
      </h3>
      {shots.length === 0 ? (
        <p className="dim log__empty">{t.battle.logEmpty}</p>
      ) : (
        <ol className="log" aria-labelledby={id}>
          {shots.map((entry) => (
            <li
              key={entry.id}
              className={`log__entry log__entry--${entry.result} log__entry--seat${entry.seat}`}
            >
              <span className="num log__coord">{coordLabel(entry.coord)}</span>{" "}
              {entry.result === "sunk"
                ? t.battle.logResult.sunk(entry.shipId ? t.ships[entry.shipId] : "")
                : t.battle.logResult[entry.result]}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type FleetState = "intact" | "damaged" | "sunk" | "unconfirmed";

function FleetPanel({
  title,
  items,
  className,
}: {
  readonly title: string;
  readonly items: readonly { ship: ShipSpec; state: FleetState }[];
  readonly className?: string;
}) {
  const labels: Record<FleetState, string> = {
    intact: t.battle.intact,
    damaged: t.battle.damaged,
    sunk: t.battle.sunk,
    unconfirmed: t.battle.unconfirmed,
  };
  return (
    <section className={["panel fleet", className].filter(Boolean).join(" ")}>
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
