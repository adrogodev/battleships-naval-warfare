import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@battleships/shared";
import { JOIN_PARAM } from "../adapters/socketGame";

/** Typing helper: upper case, no spaces, at most 6 characters; flags characters codes never use. */
export function normalizeCodeInput(raw: string): { value: string; ambiguous: boolean } {
  const value = raw.replace(/\s+/g, "").toUpperCase().slice(0, ROOM_CODE_LENGTH);
  const ambiguous = [...value].some((char) => !ROOM_CODE_ALPHABET.includes(char));
  return { value, ambiguous };
}

/** Room code from the share link (`?sala=CODE`), or null. */
export function codeFromLocation(search: string): string | null {
  const raw = new URLSearchParams(search).get(JOIN_PARAM);
  if (!raw) return null;
  const { value } = normalizeCodeInput(raw);
  return value.length > 0 ? value : null;
}

export function shareUrlFor(code: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?${JOIN_PARAM}=${code}`;
}
