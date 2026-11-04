import { coordLabel, pickOne, type Rng } from "@battleships/shared";
import type { LogEntry } from "../adapters/localAiGame";
import { t } from "../i18n/es";

export const OPERATION_NOUNS = t.operation.nouns;
export const OPERATION_ADJECTIVES = t.operation.adjectives;

/** e.g. "Operación Tridente Gris": adjective agrees with the noun's gender. */
export function operationName(rng: Rng): string {
  const noun = pickOne(rng, OPERATION_NOUNS);
  const adjective = pickOne(rng, OPERATION_ADJECTIVES);
  return `${t.operation.prefix} ${noun.word} ${noun.gender === "f" ? adjective.f : adjective.m}`;
}

function fill(template: string, coord: string, ship: string): string {
  return template.replace("{coord}", coord).replace("{ship}", ship);
}

/**
 * Communications officer line for a shot. The variant rotates with the entry id, so
 * consecutive events of the same kind never repeat the same sentence.
 */
export function commsLine(entry: LogEntry): string {
  const side = entry.seat === 0 ? t.comms.own : t.comms.enemy;
  const variants = side[entry.result];
  const template = variants[entry.id % variants.length] ?? variants[0] ?? "";
  const ship = entry.shipId ? t.ships[entry.shipId] : "";
  return fill(template, coordLabel(entry.coord), ship);
}
