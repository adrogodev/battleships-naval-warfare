import { createRng, type Placement, type RoomState } from "@battleships/shared";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { JOIN_PARAM, SocketGame } from "../adapters/socketGame";
import { useScrollToTopOn } from "../app/useEnvironment";
import type { SfxId } from "../audio";
import { t } from "../i18n/es";
import { operationName } from "../narrative/narrative";
import { gameRecordFromSnapshot, onlineGameId } from "../progress/game";
import type { ProgressReport } from "../progress/progress";
import { progressStore } from "../progress/progressStore";
import { type BattleEffects, BattleScreen } from "../screens/BattleScreen";
import { DeployScreen } from "../screens/DeployScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import type { MotionTokens } from "../theme/motion";
import { aliasOf, LiveMatch } from "./LiveMatch";
import { MultiplayerEntry } from "./MultiplayerEntry";
import { RematchPanel } from "./RematchPanel";
import { shareUrlFor } from "./roomCode";
import { StatusScreen, statusKindFor, toastMessageFor } from "./StatusScreen";
import { WaitingRoom } from "./WaitingRoom";

const TOAST_MS = 2500;

export interface MultiplayerFlowProps {
  /** Room code from the invitation link, if the app was opened with one. */
  readonly initialCode: string | null;
  readonly createGame?: () => SocketGame;
  readonly motion: MotionTokens;
  readonly reducedMotion: boolean;
  readonly confirmShot: boolean;
  readonly compact: boolean;
  readonly showBlocked: boolean;
  readonly effects: BattleEffects;
  readonly play: (id: SfxId) => void;
  readonly onMenu: () => void;
}

function hashCode(code: string): number {
  let hash = 0;
  for (const char of code) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return hash;
}

const rivalOf = (room: RoomState) =>
  room.players.find((player) => player.seat !== room.you) ?? null;

/** Online multiplayer: entry, waiting room, deployment, battle and results, driven by the server. */
export function MultiplayerFlow(props: MultiplayerFlowProps) {
  const [game] = useState(() => (props.createGame ?? (() => new SocketGame()))());
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot);
  const [showResults, setShowResults] = useState(false);
  const [round, setRound] = useState(0);
  const [rivalLeft, setRivalLeft] = useState(false);
  const [report, setReport] = useState<ProgressReport | null>(null);

  useEffect(() => {
    game.connect();
    return () => game.dispose();
  }, [game]);

  const { room, battle, error } = snapshot;
  const phase = room?.view?.phase ?? null;

  // A rematch both accepted: a new deployment in the same room.
  useEffect(() => {
    if (phase === "placement" && showResults) {
      setShowResults(false);
      setRivalLeft(false);
      setReport(null);
      setRound((value) => value + 1);
    }
  }, [phase, showResults]);

  const toast = error ? toastMessageFor(error.code) : null;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => game.clearError(), TOAST_MS);
    return () => clearTimeout(id);
  }, [game, toast]);

  const exit = () => {
    game.exit();
    const url = new URL(window.location.href);
    if (url.searchParams.has(JOIN_PARAM)) {
      url.searchParams.delete(JOIN_PARAM);
      window.history.replaceState(null, "", url);
    }
    props.onMenu();
  };

  const kind = statusKindFor(snapshot);
  // Mirrors the branches below: each of these views is a new screen for the player.
  const fleetSent = room?.players.find((player) => player.seat === room.you)?.fleetSubmitted;
  const view = !room
    ? "entry"
    : !room.view || !battle
      ? "waiting"
      : phase === "placement" || phase === "lobby"
        ? fleetSent
          ? "fleet-sent"
          : "deploy"
        : showResults
          ? "results"
          : "battle";
  useScrollToTopOn(`${kind ?? view}:${round}`);
  if (kind) return <StatusScreen kind={kind} onRetry={() => game.retry()} onMenu={exit} />;

  let content: ReactNode;
  if (!room) {
    content = (
      <MultiplayerEntry
        initialCode={props.initialCode}
        pending={snapshot.pending}
        onCreate={(alias, timer) => void game.createRoom(alias, timer)}
        onJoin={(code, alias) => void game.joinRoom(code, alias)}
        onBack={exit}
      />
    );
  } else if (!room.view || !battle) {
    content = (
      <WaitingRoom
        room={room}
        shareUrl={shareUrlFor(room.code, window.location)}
        onReady={() => {
          props.play("click");
          void game.ready();
        }}
        onLeave={exit}
      />
    );
  } else if (room.view.phase === "placement" || room.view.phase === "lobby") {
    const me = room.players.find((player) => player.seat === room.you);
    // The rival can drop while fleets are being deployed too: warn, offer the claim and an exit.
    const live = (
      <LiveMatch
        room={room}
        reactions={snapshot.reactions}
        onReact={(reaction) => void game.react(reaction)}
        onClaimVictory={() => void game.claimVictory()}
      />
    );
    content = me?.fleetSubmitted ? (
      <main className="screen mp-waiting">
        <section className="panel mp-card mp-status__panel" aria-busy="true">
          <span className="mp-status__sweep" aria-hidden="true" />
          <h1 className="mp-status__title">{t.multiplayer.fleetSent}</h1>
          <p>{t.multiplayer.fleetWaiting(aliasOf(room, room.you === 0 ? 1 : 0))}</p>
          <button type="button" className="ghost" onClick={exit}>
            {t.multiplayer.leaveRoom}
          </button>
        </section>
        {live}
      </main>
    ) : (
      <>
        <DeployScreen
          key={round}
          rules={room.view.rules}
          onReady={(fleet: readonly Placement[]) => void game.submitFleet(fleet)}
          play={props.play}
        />
        <div className="mp-deploy-live">
          {live}
          <button type="button" className="ghost" onClick={exit}>
            {t.multiplayer.leaveRoom}
          </button>
        </div>
      </>
    );
  } else if (showResults) {
    const rival = rivalOf(room);
    const won = room.view.winner === room.you;
    const rivalGone = rivalLeft || rival === null || room.endReason === "abandoned";
    content = (
      <ResultsScreen
        snapshot={battle}
        onMenu={exit}
        progress={report}
        {...(won && room.endReason !== "fleet_destroyed"
          ? { summary: t.multiplayer.rivalForfeit }
          : {})}
        extra={
          <RematchPanel
            room={room}
            rivalGone={rivalGone}
            onRematch={async () => {
              props.play("click");
              const result = await game.rematch();
              if (!result.ok && result.error === "OPPONENT_GONE") setRivalLeft(true);
            }}
          />
        }
      />
    );
  } else {
    const rival = rivalOf(room);
    content = (
      <BattleScreen
        key={round}
        snapshot={battle}
        operation={operationName(createRng(hashCode(`${room.code}${round}`)))}
        opponent={{ kind: "human", alias: rival?.alias ?? "" }}
        commanderComments={false}
        motion={props.motion}
        reducedMotion={props.reducedMotion}
        confirmShot={props.confirmShot}
        compact={props.compact}
        showBlocked={props.showBlocked}
        effects={props.effects}
        frozen={room.reconnect !== null || snapshot.status !== "connected"}
        onFire={(coord) => void game.fire(coord)}
        onLeave={async () => {
          const result = await game.leave();
          // The server answers a forfeit with the final state; otherwise there is nothing to show.
          if (!result.ok || game.getSnapshot().room?.view?.phase !== "finished") exit();
        }}
        onFinished={() => {
          // Counted once: the id is the room code plus a fingerprint of the full shot log.
          const recorded = progressStore.recordGame(
            gameRecordFromSnapshot(battle, {
              id: onlineGameId(room.code, battle.log),
              mode: "online",
              difficulty: null,
            }),
          );
          if (recorded) setReport(recorded);
          setShowResults(true);
        }}
        live={
          <LiveMatch
            room={room}
            reactions={snapshot.reactions}
            onReact={(reaction) => void game.react(reaction)}
            onClaimVictory={() => void game.claimVictory()}
          />
        }
      />
    );
  }

  return (
    <>
      {content}
      {snapshot.status === "reconnecting" && (
        <p className="mp-link-lost" role="status">
          {t.multiplayer.states.reconnecting.text}
        </p>
      )}
      <div className="toast-live" aria-live="assertive">
        {toast && error && (
          <p key={error.id} className="toast">
            <span className="label">{t.multiplayer.invalidAction}</span> {toast}
          </p>
        )}
      </div>
    </>
  );
}
