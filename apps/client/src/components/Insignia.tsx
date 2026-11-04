import type { Difficulty } from "@battleships/shared";

interface InsigniaProps {
  readonly rank: Difficulty;
  readonly className?: string;
}

/**
 * Decorative rank insignia of a rival commander (the name always sits next to it):
 * Alférez one chevron, Capitán two bars, Almirante a star inside a laurel.
 */
export function Insignia({ rank, className }: InsigniaProps) {
  return (
    <svg
      className={["insignia", `insignia--${rank}`, className].filter(Boolean).join(" ")}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="insignia__plate" x="1" y="1" width="30" height="30" />
      {rank === "easy" && <path className="insignia__stroke" d="M8 12 L16 19 L24 12" />}
      {rank === "normal" && (
        <>
          <rect className="insignia__fill" x="7" y="10" width="18" height="4" />
          <rect className="insignia__fill" x="7" y="18" width="18" height="4" />
        </>
      )}
      {rank === "hard" && (
        <>
          <path
            className="insignia__fill"
            d="M16 7 L18.2 12.9 L24.5 13.1 L19.5 17 L21.3 23 L16 19.5 L10.7 23 L12.5 17 L7.5 13.1 L13.8 12.9 Z"
          />
          <path className="insignia__stroke insignia__laurel" d="M6 11 Q4 20 12 26" />
          <path className="insignia__stroke insignia__laurel" d="M26 11 Q28 20 20 26" />
        </>
      )}
    </svg>
  );
}
