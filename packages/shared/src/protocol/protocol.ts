import { z } from "zod";
import type { Coord } from "../board/coord";
import type { Placement } from "../board/placement";
import type { Seat } from "../game/game";
import type { PlayerView } from "../game/view";
import { type Rng, randomInt } from "../random/rng";
import { SHIP_IDS, type ShipId } from "../rules/rules";

/**
 * Multiplayer protocol shared by client and server. The client only sends intents; the server
 * validates every payload with these schemas (unknown fields are stripped) and decides results.
 * See docs/PROTOCOL.md for the full event list.
 */

// ---------- Room codes ----------

/** No O/0 or I/1, so a code read aloud or from a screenshot is never ambiguous. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(rng: Rng): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(rng, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH && [...code].every((char) => ROOM_CODE_ALPHABET.includes(char))
  );
}

const roomCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine(isValidRoomCode, "Invalid room code");

// ---------- Aliases ----------

export const ALIAS_MIN = 2;
export const ALIAS_MAX = 16;
const ALIAS_CHARS = /^[\p{L}\p{N} _-]+$/u;

export type AliasCheck =
  | { ok: true; alias: string }
  | { ok: false; reason: "too_short" | "too_long" | "invalid_chars" };

export function normalizeAlias(input: string): AliasCheck {
  const alias = input.trim().replace(/\s+/g, " ");
  if (alias.length < ALIAS_MIN) return { ok: false, reason: "too_short" };
  if (alias.length > ALIAS_MAX) return { ok: false, reason: "too_long" };
  if (!ALIAS_CHARS.test(alias)) return { ok: false, reason: "invalid_chars" };
  return { ok: true, alias };
}

const aliasSchema = z.string().transform((value, ctx) => {
  const check = normalizeAlias(value);
  if (!check.ok) {
    ctx.addIssue({ code: "custom", message: check.reason });
    return z.NEVER;
  }
  return check.alias;
});

// ---------- Shared payload pieces ----------

/** Unique per intent; the server answers a repeated actionId with the stored response. */
const actionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const coordSchema = z.object({
  col: z.number().int().min(0).max(14),
  row: z.number().int().min(0).max(14),
});

const placementSchema = z.object({
  shipId: z.enum(SHIP_IDS),
  bow: coordSchema,
  orientation: z.enum(["h", "v"]),
});

export const REACTIONS = ["good_shot", "close", "well_played", "ouch"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const TURN_TIMER_MIN = 15;
export const TURN_TIMER_MAX = 120;

/** Hard limits enforced by the server per connection. */
export const PROTOCOL_LIMITS = {
  maxMessageBytes: 4096,
  messagesPerSecond: 10,
} as const;

// ---------- Client → server ----------

export const clientSchemas = {
  "room:create": z.object({
    alias: aliasSchema,
    turnTimerSec: z.number().int().min(TURN_TIMER_MIN).max(TURN_TIMER_MAX).nullable().optional(),
  }),
  /** Join by code (new seat) or by session token (reconnect to the same seat). */
  "room:join": z.union([
    z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) }),
    z.object({ code: roomCodeSchema, alias: aliasSchema }),
  ]),
  /** Ready in the waiting room; placement starts when both players are ready. */
  "room:ready": z.object({ actionId: actionIdSchema }),
  "fleet:submit": z.object({ actionId: actionIdSchema, fleet: z.array(placementSchema).max(10) }),
  "shot:fire": z.object({ actionId: actionIdSchema, coord: coordSchema }),
  "rematch:request": z.object({ actionId: actionIdSchema }),
  "room:leave": z.object({ actionId: actionIdSchema }),
  "reaction:send": z.object({ actionId: actionIdSchema, reaction: z.enum(REACTIONS) }),
  /** Only accepted once the absent rival's reconnection window has expired. */
  "victory:claim": z.object({ actionId: actionIdSchema }),
} as const;

export type ClientEvent = keyof typeof clientSchemas;
export type ClientPayload<E extends ClientEvent> = z.input<(typeof clientSchemas)[E]>;

// ---------- Server → client ----------

export const ERROR_CODES = [
  "INVALID_PAYLOAD",
  "RATE_LIMITED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "INVALID_TOKEN",
  "SESSION_REPLACED",
  "NOT_IN_ROOM",
  "NOT_READY",
  "WRONG_PHASE",
  "NOT_YOUR_TURN",
  "OUT_OF_BOUNDS",
  "ALREADY_FIRED",
  "INVALID_FLEET",
  "ALREADY_SUBMITTED",
  "ALREADY_REQUESTED",
  "OPPONENT_GONE",
  "CANNOT_CLAIM",
  "SERVER_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Public record of one resolved shot: everything in it is visible to both players. */
export interface ShotRecord {
  readonly id: number;
  readonly seat: Seat;
  readonly coord: Coord;
  readonly result: "miss" | "hit" | "sunk";
  readonly shipId?: ShipId;
}

export interface RoomPlayerInfo {
  readonly seat: Seat;
  readonly alias: string;
  readonly connected: boolean;
  readonly ready: boolean;
  readonly fleetSubmitted: boolean;
  readonly rematchRequested: boolean;
}

export type EndReason = "fleet_destroyed" | "forfeit" | "abandoned";

/** Built per player by the server (viewFor): never contains the rival's hidden ships. */
export interface RoomState {
  readonly code: string;
  readonly you: Seat;
  readonly players: readonly RoomPlayerInfo[];
  /** Null while the waiting room is not complete and ready. */
  readonly view: PlayerView | null;
  readonly log: readonly ShotRecord[];
  readonly turnTimerSec: number | null;
  /** Epoch ms when the current turn times out, or null. */
  readonly turnDeadline: number | null;
  /** Set while a player is disconnected: the game is frozen until the deadline. */
  readonly reconnect: { readonly seat: Seat; readonly deadline: number } | null;
  readonly canClaimVictory: boolean;
  readonly endReason: EndReason | null;
  /** Revealed only once the game is over (final maps). */
  readonly revealedOpponentFleet: readonly Placement[] | null;
}

export type Ack<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: ErrorCode; message?: string };

export type JoinAck = Ack<{ code: string; token: string; seat: Seat }>;

export interface ServerEvents {
  "room:state": (state: RoomState) => void;
  "shot:result": (shot: ShotRecord) => void;
  "turn:changed": (payload: { turn: Seat; deadline: number | null }) => void;
  "player:disconnected": (payload: { seat: Seat; alias: string; deadline: number }) => void;
  "player:reconnected": (payload: { seat: Seat }) => void;
  "game:over": (payload: { winner: Seat; reason: EndReason }) => void;
  "reaction:received": (payload: { seat: Seat; reaction: Reaction }) => void;
  error: (payload: { code: ErrorCode; message?: string }) => void;
}

export interface ClientEvents {
  "room:create": (payload: ClientPayload<"room:create">, ack: (res: JoinAck) => void) => void;
  "room:join": (payload: ClientPayload<"room:join">, ack: (res: JoinAck) => void) => void;
  "room:ready": (payload: ClientPayload<"room:ready">, ack: (res: Ack) => void) => void;
  "fleet:submit": (payload: ClientPayload<"fleet:submit">, ack: (res: Ack) => void) => void;
  "shot:fire": (payload: ClientPayload<"shot:fire">, ack: (res: Ack) => void) => void;
  "rematch:request": (payload: ClientPayload<"rematch:request">, ack: (res: Ack) => void) => void;
  "room:leave": (payload: ClientPayload<"room:leave">, ack: (res: Ack) => void) => void;
  "reaction:send": (payload: ClientPayload<"reaction:send">, ack: (res: Ack) => void) => void;
  "victory:claim": (payload: ClientPayload<"victory:claim">, ack: (res: Ack) => void) => void;
}
