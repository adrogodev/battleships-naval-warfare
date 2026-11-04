import { REACTIONS, type Reaction, type RoomState } from "@battleships/shared";
import { useEffect, useState } from "react";
import type { ReactionNotice } from "../adapters/socketGame";
import { t } from "../i18n/es";
import { useCountdown } from "./useCountdown";

/** How long a received reaction stays on screen. */
const REACTION_MS = 3500;

interface LiveMatchProps {
  readonly room: RoomState;
  readonly reactions: readonly ReactionNotice[];
  readonly onReact: (reaction: Reaction) => void;
  readonly onClaimVictory: () => void;
}

export function aliasOf(room: RoomState, seat: number): string {
  return room.players.find((player) => player.seat === seat)?.alias ?? "";
}

/** Multiplayer layer of the battle: turn banner, turn timer, rival disconnection and reactions. */
export function LiveMatch({ room, reactions, onReact, onClaimVictory }: LiveMatchProps) {
  const copy = t.multiplayer;
  const view = room.view;
  const inBattle = view?.phase === "battle";
  const myTurn = inBattle && view.turn === room.you;
  const turnLeft = useCountdown(inBattle ? room.turnDeadline : null);
  const reconnectLeft = useCountdown(room.reconnect?.deadline ?? null);
  const rivalAlias = aliasOf(room, room.you === 0 ? 1 : 0);
  const [dismissedClaim, setDismissedClaim] = useState(false);

  // A new disconnection asks again.
  const reconnectKey = room.reconnect ? `${room.reconnect.seat}:${room.reconnect.deadline}` : null;
  useEffect(() => {
    if (reconnectKey === null) setDismissedClaim(false);
  }, [reconnectKey]);

  const [visible, setVisible] = useState<readonly ReactionNotice[]>([]);
  // Notices keep their identity across snapshots, so only a new reaction schedules a bubble.
  const latest = reactions.at(-1);
  useEffect(() => {
    if (!latest) return;
    setVisible((current) =>
      current.some((notice) => notice.id === latest.id) ? current : [...current, latest].slice(-3),
    );
    const id = setTimeout(
      () => setVisible((current) => current.filter((notice) => notice.id !== latest.id)),
      REACTION_MS,
    );
    return () => clearTimeout(id);
  }, [latest]);

  const away = room.reconnect && room.reconnect.seat !== room.you ? room.reconnect : null;

  return (
    <div className="live">
      {inBattle && (
        <div
          className={`live-turn${myTurn ? " live-turn--mine" : ""}`}
          role="status"
          aria-label={myTurn ? copy.turnYours : copy.turnRival(rivalAlias)}
        >
          <span className="live-turn__text">
            {myTurn ? copy.turnYours : copy.turnRival(rivalAlias)}
          </span>
          {turnLeft !== null && (
            <span
              className={`live-turn__timer num${turnLeft <= 5 ? " is-urgent" : ""}`}
              title={copy.timeLeftLabel}
            >
              {copy.timeLeft(turnLeft)}
            </span>
          )}
        </div>
      )}

      {away && (
        <div className="live-alert panel" role="alert">
          <p className="live-alert__title">{copy.disconnected(aliasOf(room, away.seat))}</p>
          {room.canClaimVictory && !dismissedClaim ? (
            <>
              <p>{copy.claimPrompt}</p>
              <div className="mp-actions">
                <button type="button" className="primary" onClick={onClaimVictory}>
                  {copy.claimVictory}
                </button>
                <button type="button" onClick={() => setDismissedClaim(true)}>
                  {copy.keepWaiting}
                </button>
              </div>
            </>
          ) : (
            <p className="num">{copy.reconnectCountdown(reconnectLeft ?? 0)}</p>
          )}
        </div>
      )}

      <div className="reactions" aria-live="polite">
        {visible.map((notice) => (
          <p key={notice.id} className={`reaction-bubble${notice.mine ? " is-mine" : ""}`}>
            <span className="label">
              {copy.reactionFrom(notice.mine ? copy.you : aliasOf(room, notice.seat))}
            </span>{" "}
            <span className="reaction-bubble__text">{copy.reactionLabels[notice.reaction]}</span>
          </p>
        ))}
      </div>

      {view?.phase !== "finished" && (
        <fieldset className="reaction-bar">
          <legend className="sr-only">{copy.reactions}</legend>
          {REACTIONS.map((reaction) => (
            <button key={reaction} type="button" className="chip" onClick={() => onReact(reaction)}>
              {copy.reactionLabels[reaction]}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
