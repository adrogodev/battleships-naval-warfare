import type { Orientation, ShipId } from "@battleships/shared";
import type { ReactNode } from "react";

/** Top-view silhouettes, 20 units per cell along the ship and 20 units across (from the approved prototype). */
const SHAPES: Record<ShipId, ReactNode> = {
  carrier: (
    <>
      <path className="hull" d="M3 4 L88 3 L98 7 L98 13 L88 17 L3 16 Z" />
      <path className="detail" d="M10 10 H84 M14 6 L60 14" />
      <rect className="detail-fill" x="62" y="13.5" width="12" height="3" />
      <path className="detail" d="M8 7 V13 M90 9 H95" />
    </>
  ),
  battleship: (
    <>
      <path
        className="hull"
        d="M4 6 Q4 3 10 3 L62 3 Q76 4 79 10 Q76 16 62 17 L10 17 Q4 17 4 14 Z"
      />
      <circle className="detail-fill" cx="58" cy="10" r="3.2" />
      <path className="detail" d="M61 10 H69" />
      <circle className="detail-fill" cx="46" cy="10" r="3.2" />
      <path className="detail" d="M49 10 H55" />
      <rect className="detail" x="26" y="6.5" width="12" height="7" />
      <circle className="detail-fill" cx="16" cy="10" r="3.2" />
      <path className="detail" d="M13 10 H6" />
    </>
  ),
  cruiser: (
    <>
      <path className="hull" d="M3 7 Q3 4 8 4 L44 4 Q55 5 58 10 Q55 15 44 16 L8 16 Q3 16 3 13 Z" />
      <circle className="detail-fill" cx="43" cy="10" r="2.6" />
      <path className="detail" d="M45.5 10 H52" />
      <rect className="detail" x="22" y="7" width="12" height="6" />
      <circle className="detail-fill" cx="12" cy="10" r="2.6" />
      <path className="detail" d="M9.5 10 H5" />
    </>
  ),
  submarine: (
    <>
      <path
        className="hull"
        d="M4 10 Q4 5.5 14 5.5 L46 5.5 Q58 6 58 10 Q58 14 46 14.5 L14 14.5 Q4 14.5 4 10 Z"
      />
      <rect className="detail-fill" x="30" y="8" width="9" height="4" rx="2" />
      <path className="detail" d="M2 7 V13 M10 10 H26" />
    </>
  ),
  destroyer: (
    <>
      <path className="hull" d="M3 7 L26 5 Q36 6 39 10 Q36 14 26 15 L3 13 Z" />
      <circle className="detail-fill" cx="27" cy="10" r="2.2" />
      <path className="detail" d="M29 10 H34" />
      <rect className="detail" x="12" y="7.5" width="8" height="5" />
    </>
  ),
};

interface ShipSilhouetteProps {
  readonly shipId: ShipId;
  readonly length: number;
  readonly orientation?: Orientation;
  readonly className?: string;
}

/** Decorative: the accessible state of a ship is always carried by cells and fleet panels. */
export function ShipSilhouette({
  shipId,
  length,
  orientation = "h",
  className,
}: ShipSilhouetteProps) {
  const span = length * 20;
  return orientation === "h" ? (
    <svg
      className={className}
      viewBox={`0 0 ${span} 20`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[shipId]}
    </svg>
  ) : (
    <svg
      className={className}
      viewBox={`0 0 20 ${span}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(20 0) rotate(90)">{SHAPES[shipId]}</g>
    </svg>
  );
}
