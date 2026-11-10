import {
  type Coord,
  coordKey,
  coordLabel,
  type GameState,
  type Orientation,
  type Placement,
  type PlacementCheck,
  shipCells,
  validatePlacement,
} from "@battleships/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { SfxId } from "../audio";
import { Board, type BoardShip, type CellView } from "../components/Board";
import { t } from "../i18n/es";

const copy = t.tutorial;

import type { MotionTokens } from "../theme/motion";
import {
  ENEMY_SHIP,
  fireDrill,
  type Hint,
  hintAfter,
  startDrill,
  TUTORIAL_RULES,
  TUTORIAL_SHIP_LENGTH,
} from "./tutorialGame";
import "./tutorial.css";

export interface TutorialScreenProps {
  readonly motion: MotionTokens;
  readonly reducedMotion: boolean;
  readonly play: (id: SfxId) => void;
  /** Back to the main menu (skip or finish). */
  readonly onExit: () => void;
}

type Step = "place" | "fire" | "sink" | "done";

const STEPS = ["place", "fire", "sink"] as const;
const SIZE = TUTORIAL_RULES.boardSize;

interface Announcement {
  readonly text: string;
  readonly bad: boolean;
}

/**
 * "Cómo jugar": a one-minute interactive drill on a 6×6 board with one destroyer per side.
 * Place your ship, fire at the radar, keep firing until the hidden destroyer sinks.
 */
export function TutorialScreen({ motion, reducedMotion, play, onExit }: TutorialScreenProps) {
  const [step, setStep] = useState<Step>("place");
  const [orientation, setOrientation] = useState<Orientation>("h");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pointer, setPointer] = useState<Coord | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [incoming, setIncoming] = useState<Coord | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  const [revealed, setRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", bad: false });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  // A new view moves focus to its heading so screen readers and keyboards follow along.
  // "fire" and "sink" share the radar view: the player keeps their place on the board.
  const view = step === "sink" ? "fire" : step;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the focus must follow the view
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  useEffect(() => {
    if (step !== "place") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "r" || event.key === "R") setOrientation((o) => (o === "h" ? "v" : "h"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  // Step 1: placement.
  const candidateAt = (bow: Coord): Placement => ({ shipId: "destroyer", bow, orientation });
  const checkAt = (bow: Coord): PlacementCheck =>
    validatePlacement([], candidateAt(bow), TUTORIAL_RULES);
  const ghost =
    pointer && step === "place" ? shipCells(candidateAt(pointer), TUTORIAL_SHIP_LENGTH) : [];
  const ghostOk = pointer !== null && checkAt(pointer).ok;
  const ghostKeys = new Set(ghost.map(coordKey));
  const ownKeys = new Set(
    placement ? shipCells(placement, TUTORIAL_SHIP_LENGTH).map(coordKey) : [],
  );

  const deckCellAt = (coord: Coord): CellView => {
    const key = coordKey(coord);
    if (ghostKeys.has(key)) {
      return ghostOk
        ? { kind: "ghost-ok", label: copy.cell.validHere }
        : { kind: "ghost-bad", label: copy.invalid.out_of_bounds };
    }
    return { kind: "empty", label: ownKeys.has(key) ? copy.cell.ship : copy.cell.water };
  };

  const place = (bow: Coord) => {
    const check = checkAt(bow);
    if (!check.ok) {
      setAnnouncement({ text: copy.invalid[check.reason], bad: true });
      play("click");
      return;
    }
    setPlacement(candidateAt(bow));
    const direction = orientation === "h" ? copy.horizontal : copy.vertical;
    setAnnouncement({ text: copy.placed(coordLabel(bow), direction), bad: false });
    play("place");
  };

  const startFiring = () => {
    if (!placement) return;
    setGame(startDrill(placement));
    setPointer(null);
    setAnnouncement({ text: "", bad: false });
    setStep("fire");
    play("click");
  };

  // Steps 2 and 3: firing at the radar.
  const fire = (coord: Coord) => {
    if (!game || incoming) return;
    const label = coordLabel(coord);
    const shot = fireDrill(game, coord);
    if (!shot.ok) {
      if (shot.reason === "already_fired") {
        setAnnouncement({ text: copy.alreadyFired(label), bad: true });
      }
      return;
    }
    play("fire");
    setIncoming(coord);
    setAnnouncement({ text: copy.firing(label), bad: false });
    later(motion.fireMs + motion.suspenseMs, () => {
      setIncoming(null);
      setGame(shot.state);
      setHint(hintAfter(shot.state, shot.result));
      setAnnouncement({ text: copy.result[shot.result](label), bad: false });
      play(shot.result);
      if (shot.result === "sunk") {
        later(motion.sinkPauseMs + motion.resultMs, () => {
          setRevealed(true);
          setStep("done");
        });
      } else {
        setStep("sink");
      }
    });
  };

  const enemy = game?.players[1];
  const radarCellAt = (coord: Coord): CellView => {
    const mark = enemy?.shotsReceived[coordKey(coord)];
    if (mark === "miss") return { kind: "miss", label: copy.cell.miss };
    if (mark === "hit") {
      return enemy && enemy.sunk.length > 0
        ? { kind: "sunk", label: copy.cell.sunk }
        : { kind: "hit", label: copy.cell.hit };
    }
    return { kind: "empty", label: copy.cell.unknown };
  };
  const enemyShips: BoardShip[] = revealed
    ? [{ placement: ENEMY_SHIP, length: TUTORIAL_SHIP_LENGTH, state: "sunk" }]
    : [];
  const hintText =
    hint?.kind === "cell"
      ? copy.hintTry(coordLabel(hint.coord))
      : hint?.kind === "neighbours"
        ? copy.hintNeighbours
        : "";
  const aim = hint?.kind === "cell" ? hint.coord : pointer;

  const stepIndex = step === "done" ? STEPS.length : STEPS.indexOf(step);
  const style = {
    "--tut-reveal": `${motion.sinkPauseMs + motion.resultMs}ms`,
    "--tut-screen": `${motion.screenMs}ms`,
  } as CSSProperties;

  return (
    <main className={`screen tutorial${reducedMotion ? " tutorial--reduced" : ""}`} style={style}>
      <header className="tutorial__header">
        <h1 className="screen__title">{copy.title}</h1>
        <button type="button" className="ghost" onClick={onExit}>
          {copy.skip}
        </button>
      </header>

      <div className="tutorial__progress">
        <p className="label">{copy.stepOf(Math.min(stepIndex + 1, STEPS.length), STEPS.length)}</p>
        <ol aria-label={copy.progressLabel}>
          {STEPS.map((id, index) => (
            <li
              key={id}
              className={index < stepIndex ? "is-done" : index === stepIndex ? "is-current" : ""}
              aria-current={index === stepIndex ? "step" : undefined}
            >
              {copy.steps[id].name}
            </li>
          ))}
        </ol>
      </div>

      {step === "place" && (
        <section className="tutorial__step" key="place">
          <div className="panel tutorial__guide">
            <h2 ref={headingRef} tabIndex={-1} className="tutorial__heading">
              {copy.steps.place.heading}
            </h2>
            <p>{copy.steps.place.text}</p>
            <p className="hint">{copy.steps.place.keys}</p>
          </div>
          <Board
            size={SIZE}
            label={copy.boardOwn}
            variant="deck"
            cellAt={deckCellAt}
            ships={placement ? [{ placement, length: TUTORIAL_SHIP_LENGTH, state: "intact" }] : []}
            onActivate={place}
            onPoint={setPointer}
          />
          <div className="tutorial__actions">
            <button
              type="button"
              onClick={() => {
                setOrientation((o) => (o === "h" ? "v" : "h"));
                play("click");
              }}
            >
              {copy.rotate} · {orientation === "h" ? copy.horizontal : copy.vertical}
            </button>
            <button
              type="button"
              className="primary"
              disabled={placement === null}
              onClick={startFiring}
            >
              {copy.next}
            </button>
          </div>
        </section>
      )}

      {(step === "fire" || step === "sink") && (
        <section className="tutorial__step" key="fire">
          <div className="panel tutorial__guide">
            <h2 ref={headingRef} tabIndex={-1} className="tutorial__heading">
              {copy.steps[step].heading}
            </h2>
            <p>{copy.steps[step].text}</p>
            <p className="tutorial__hint" aria-live="polite">
              {hintText}
            </p>
          </div>
          <Board
            size={SIZE}
            label={copy.boardRadar}
            variant="radar"
            cellAt={radarCellAt}
            aim={aim}
            incoming={incoming}
            locked={incoming !== null}
            onActivate={fire}
            onPoint={setPointer}
          />
        </section>
      )}

      {step === "done" && (
        <section className="tutorial__step" key="done">
          <div className="panel tutorial__guide tutorial__done">
            <h2 ref={headingRef} tabIndex={-1} className="tutorial__heading">
              {copy.done.heading}
            </h2>
            <p>{copy.done.text}</p>
            <p className="tutorial__cta">{copy.done.cta}</p>
            <button type="button" className="primary" onClick={onExit}>
              {copy.done.back}
            </button>
          </div>
          <Board
            size={SIZE}
            label={copy.boardRadar}
            variant="radar"
            className="tutorial__reveal"
            cellAt={radarCellAt}
            ships={enemyShips}
          />
        </section>
      )}

      <p
        className={`status${announcement.bad ? " status--bad" : ""}`}
        role="status"
        aria-live="polite"
      >
        {announcement.text}
      </p>
    </main>
  );
}
