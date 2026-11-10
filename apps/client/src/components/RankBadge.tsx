import type { ReactNode } from "react";

interface RankBadgeProps {
  /** Rank index: 0 = Grumete … 9 = Almirante de Flota (see progress/ranks). */
  readonly index: number;
  readonly className?: string;
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** Positions of the chevrons or bars, top to bottom. */
const STRIPES = [0, 1, 2, 3] as const;

const STAR =
  "M0 -6 L1.8 -1.9 L6.2 -1.9 L2.6 0.8 L3.9 5 L0 2.5 L-3.9 5 L-2.6 0.8 L-6.2 -1.9 L-1.8 -1.9 Z";

/**
 * Decorative player rank insignia (the rank name always sits next to it), in the same plate
 * style as the rival commanders' Insignia: enlisted ranks wear chevrons, officers bars,
 * flag officers stars (the Almirante de Flota adds a laurel).
 */
export function RankBadge({ index, className }: RankBadgeProps) {
  let marks: ReactNode;
  let tier: "enlisted" | "officer" | "flag";
  if (index <= 3) {
    tier = "enlisted";
    // Grumete: a plain plate; Marinero to Suboficial: one to three chevrons.
    marks = STRIPES.slice(0, index).map((stripe) => (
      <path
        key={stripe}
        className="insignia__stroke"
        d={`M9 ${9 + stripe * 6} L16 ${14 + stripe * 6} L23 ${9 + stripe * 6}`}
      />
    ));
  } else if (index <= 7) {
    tier = "officer";
    // Alférez de Navío to Capitán de Navío: one to four bars.
    const bars = index - 3;
    marks = STRIPES.slice(0, bars).map((stripe) => (
      <rect
        key={stripe}
        className="insignia__fill"
        x="7"
        y={16 - bars * 3 + stripe * 6}
        width="18"
        height="3"
      />
    ));
  } else {
    tier = "flag";
    const top = index >= 9;
    marks = (
      <>
        <path
          className="insignia__fill"
          d={STAR}
          transform={top ? "translate(11 15)" : "translate(16 15)"}
        />
        {top && <path className="insignia__fill" d={STAR} transform="translate(21 15)" />}
        {top && (
          <>
            <path className="insignia__stroke insignia__laurel" d="M6 11 Q4 20 12 26" />
            <path className="insignia__stroke insignia__laurel" d="M26 11 Q28 20 20 26" />
          </>
        )}
      </>
    );
  }
  return (
    <svg
      className={classes("insignia", "rank-badge", `rank-badge--${tier}`, className)}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="insignia__plate" x="1" y="1" width="30" height="30" />
      {marks}
    </svg>
  );
}

/** Challenge medal: filled when completed, an outline while pending. Decorative. */
export function ChallengeBadge({
  completed,
  className,
}: {
  readonly completed: boolean;
  readonly className?: string;
}) {
  return (
    <svg
      className={classes("challenge-badge", completed ? "is-completed" : "is-locked", className)}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path className="challenge-badge__ribbon" d="M10 2 L14 12 M22 2 L18 12" />
      <circle className="challenge-badge__disc" cx="16" cy="20" r="9" />
      {completed ? (
        <path className="challenge-badge__mark" d={STAR} transform="translate(16 20)" />
      ) : (
        <path className="challenge-badge__lock" d="M12 20 H20" />
      )}
    </svg>
  );
}
