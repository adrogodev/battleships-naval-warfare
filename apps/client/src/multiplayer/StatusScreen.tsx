import type { ClientErrorCode, MultiplayerSnapshot } from "../adapters/socketGame";
import { t } from "../i18n/es";

export type StatusKind = keyof typeof t.multiplayer.states;

/** States that can be retried; the others only offer the way back to the menu. */
const RETRYABLE: ReadonlySet<StatusKind> = new Set([
  "network",
  "offline",
  "notFound",
  "full",
  "unavailable",
  "reconnecting",
]);

/** Which full-screen state to show for a snapshot, or null to show the game itself. */
export function statusKindFor(snapshot: MultiplayerSnapshot): StatusKind | null {
  const { status, room, pending, error } = snapshot;
  if (status === "replaced") return "replaced";
  if (status === "offline") return "offline";
  if (status === "unavailable") return "unavailable";
  if (error?.code === "ROOM_NOT_FOUND") return "notFound";
  if (error?.code === "ROOM_FULL") return "full";
  if (error?.code === "INVALID_TOKEN") return "expired";
  if (error?.code === "ROOM_CLOSED") return "closed";
  if (error?.code === "TIMEOUT" && room === null) return "network";
  if (status === "connecting" || pending === "rejoin") return "loading";
  // Inside a room the game stays on screen (frozen) while the link is restored.
  if (status === "reconnecting" && room === null) return "reconnecting";
  return null;
}

/** Brief toast text for an invalid action, or null when the error has its own screen. */
export function toastMessageFor(code: ClientErrorCode): string | null {
  const errors: Partial<Record<ClientErrorCode, string>> = t.multiplayer.errors;
  return errors[code] ?? null;
}

interface StatusScreenProps {
  readonly kind: StatusKind;
  readonly onRetry: () => void;
  readonly onMenu: () => void;
}

export function StatusScreen({ kind, onRetry, onMenu }: StatusScreenProps) {
  const copy = t.multiplayer.states[kind];
  const busy = kind === "loading" || kind === "reconnecting";
  return (
    <main className={`screen mp-status mp-status--${kind}`} aria-busy={busy}>
      <section className="panel mp-status__panel" aria-labelledby="mp-status-title">
        {busy && <span className="mp-status__sweep" aria-hidden="true" />}
        <h1 id="mp-status-title" className="mp-status__title">
          {copy.title}
        </h1>
        <p>{copy.text}</p>
        <div className="mp-actions">
          {RETRYABLE.has(kind) && (
            <button type="button" className="primary" onClick={onRetry}>
              {t.multiplayer.retry}
            </button>
          )}
          <button type="button" onClick={onMenu}>
            {t.multiplayer.menu}
          </button>
        </div>
      </section>
    </main>
  );
}
