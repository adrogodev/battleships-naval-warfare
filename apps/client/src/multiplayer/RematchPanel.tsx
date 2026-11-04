import type { RoomState } from "@battleships/shared";
import { t } from "../i18n/es";
import { aliasOf } from "./LiveMatch";

interface RematchPanelProps {
  readonly room: RoomState;
  /** The rival left the room: a rematch is no longer possible. */
  readonly rivalGone: boolean;
  readonly onRematch: () => void;
}

/** Rematch state on the results screen: both players must ask for it. */
export function RematchPanel({ room, rivalGone, onRematch }: RematchPanelProps) {
  const copy = t.multiplayer;
  const rivalSeat = room.you === 0 ? 1 : 0;
  const me = room.players.find((player) => player.seat === room.you);
  const rival = room.players.find((player) => player.seat === rivalSeat);
  const rivalAlias = aliasOf(room, rivalSeat);

  if (rivalGone || !rival) {
    return (
      <p className="mp-rematch mp-rematch--gone" role="status">
        {copy.rivalGone}
      </p>
    );
  }
  const requested = me?.rematchRequested ?? false;
  let status: string | null = null;
  if (requested) status = copy.rematchWaiting(rivalAlias);
  else if (rival.rematchRequested) status = copy.rematchOffered(rivalAlias);

  return (
    <div className="mp-rematch">
      <button type="button" className="primary" onClick={onRematch} disabled={requested}>
        {requested ? copy.rematchSent : copy.rematch}
      </button>
      <p className="mp-rematch__status" role="status">
        {status ?? ""}
      </p>
    </div>
  );
}
