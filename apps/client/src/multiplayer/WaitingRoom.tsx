import type { RoomPlayerInfo, RoomState, Seat } from "@battleships/shared";
import { useEffect, useState } from "react";
import { t } from "../i18n/es";

interface WaitingRoomProps {
  readonly room: RoomState;
  readonly shareUrl: string;
  readonly onReady: () => void;
  readonly onLeave: () => void;
}

const CONFIRMATION_MS = 2500;

type CopyNotice = "code" | "link" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function WaitingRoom({ room, shareUrl, onReady, onLeave }: WaitingRoomProps) {
  const copy = t.multiplayer;
  const [notice, setNotice] = useState<{ kind: CopyNotice; id: number } | null>(null);
  const me = room.players.find((player) => player.seat === room.you);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), CONFIRMATION_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const copyAndConfirm = async (text: string, kind: "code" | "link") => {
    const ok = await copyText(text);
    setNotice((previous) => ({ kind: ok ? kind : "failed", id: (previous?.id ?? 0) + 1 }));
  };

  const noticeText: Record<CopyNotice, string> = {
    code: copy.codeCopied,
    link: copy.linkCopied,
    failed: copy.copyFailed,
  };
  const seats: Seat[] = [0, 1];

  return (
    <main className="screen mp-waiting">
      <h1 className="screen__title">{copy.waitingTitle}</h1>
      <section className="panel mp-card mp-code" aria-labelledby="room-code-label">
        <p id="room-code-label" className="label">
          {copy.roomCode}
        </p>
        <p className="room-code num">{room.code}</p>
        <div className="mp-actions">
          <button
            type="button"
            className="primary"
            onClick={() => copyAndConfirm(room.code, "code")}
          >
            {copy.copyCode}
          </button>
          <button type="button" onClick={() => copyAndConfirm(shareUrl, "link")}>
            {copy.copyLink}
          </button>
        </div>
        <p className="mp-code__notice" role="status">
          {notice ? noticeText[notice.kind] : ""}
        </p>
        <p className="dim">{copy.timerInfo(room.turnTimerSec)}</p>
      </section>

      <section className="panel mp-card" aria-labelledby="players-title">
        <h2 id="players-title" className="label">
          {copy.players}
        </h2>
        <ul className="mp-players">
          {seats.map((seat) => {
            const player = room.players.find((p) => p.seat === seat);
            return player ? (
              <PlayerRow key={seat} player={player} isYou={seat === room.you} />
            ) : (
              <li key={seat} className="mp-player mp-player--empty">
                <span className="dim">{copy.emptySeat}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mp-actions">
        {me && !me.ready ? (
          <button type="button" className="primary" onClick={onReady}>
            {copy.ready}
          </button>
        ) : (
          <p className="mp-waiting__hint">{copy.readyWaiting}</p>
        )}
        <button type="button" className="ghost" onClick={onLeave}>
          {copy.leaveRoom}
        </button>
      </div>
    </main>
  );
}

function PlayerRow({
  player,
  isYou,
}: {
  readonly player: RoomPlayerInfo;
  readonly isYou: boolean;
}) {
  const copy = t.multiplayer;
  return (
    <li className="mp-player" aria-label={player.alias}>
      <span className="mp-player__name">
        {player.alias}
        {isYou && <span className="dim"> ({copy.you})</span>}
      </span>
      <span className={`mp-pill${player.connected ? " is-on" : " is-off"}`}>
        <span className="mp-pill__dot" aria-hidden="true" />
        {player.connected ? copy.online : copy.offline}
      </span>
      <span className={`mp-pill${player.ready ? " is-ready" : ""}`}>
        {player.ready ? copy.isReady : copy.notReady}
      </span>
    </li>
  );
}
