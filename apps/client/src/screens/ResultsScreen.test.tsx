import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeBattleStats } from "../adapters/battleStats";
import type { GameSnapshot } from "../adapters/localAiGame";
import { fakeView } from "../multiplayer/testing/fakeSocket";
import { applyGame, EMPTY_PROGRESS } from "../progress/progress";
import { RANKS } from "../progress/ranks";
import { gameRecord } from "../progress/testing";
import { ResultsScreen } from "./ResultsScreen";

const snapshot: GameSnapshot = {
  view: fakeView({ phase: "finished", winner: 0 }),
  log: [],
  aiThinking: false,
  stats: computeBattleStats([], { ownSeat: 0, startedAt: 0, endedAt: 65_000, now: 65_000 }),
  revealedEnemyFleet: null,
};

describe("ResultsScreen", () => {
  it("shows the result and battle stats without progress (previous behavior)", () => {
    render(<ResultsScreen snapshot={snapshot} onMenu={() => {}} onPlayAgain={() => {}} />);
    expect(screen.getByRole("heading", { name: "Victoria" })).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hoja de servicio" })).not.toBeInTheDocument();
  });

  it("shows the experience gained, the promotion and the newly completed challenges", () => {
    const start = { ...EMPTY_PROGRESS, xp: (RANKS[1]?.minXp ?? 0) - 1 };
    const { report } = applyGame(start, gameRecord({ id: "a", won: true }));
    render(<ResultsScreen snapshot={snapshot} onMenu={() => {}} progress={report} />);
    const panel = screen.getByRole("region", { name: "Hoja de servicio" });
    expect(panel).toHaveTextContent(`+${report?.xp.total} PE`);
    expect(panel).toHaveTextContent(/¡Ascenso! Ahora eres (Marinero|Cabo)\./);
    expect(panel).toHaveTextContent("Desafíos completados");
    expect(panel).toHaveTextContent("Consigue tu primera victoria");
  });

  it("shows the current rank without a promotion", () => {
    const { report } = applyGame(
      EMPTY_PROGRESS,
      gameRecord({ id: "a", won: false, forfeited: true, enemyShipsSunk: [] }),
    );
    render(<ResultsScreen snapshot={snapshot} onMenu={() => {}} progress={report} />);
    const panel = screen.getByRole("region", { name: "Hoja de servicio" });
    expect(panel).toHaveTextContent("+0 PE");
    expect(panel).toHaveTextContent("Rango actual: Grumete");
    expect(panel).not.toHaveTextContent("Ascenso");
  });
});
