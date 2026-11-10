import type { ShotRecord } from "@battleships/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeBattleStats } from "../adapters/battleStats";
import type { GameSnapshot } from "../adapters/localAiGame";
import { fakeView } from "../multiplayer/testing/fakeSocket";
import { motionTokens } from "../theme/motion";
import { BattleScreen } from "./BattleScreen";

/** 12 shots per side, alternating: own shots on row 1, enemy shots on row 2. */
function alternatingLog(): ShotRecord[] {
  const log: ShotRecord[] = [];
  for (let col = 0; col < 12; col++) {
    const coordCol = col % 10;
    const row = col < 10 ? 0 : 2;
    log.push({ id: log.length, seat: 0, coord: { col: coordCol, row }, result: "miss" });
    log.push({ id: log.length, seat: 1, coord: { col: coordCol, row: row + 1 }, result: "hit" });
  }
  return log;
}

function renderBattle(log: readonly ShotRecord[]) {
  const snapshot: GameSnapshot = {
    view: fakeView({ phase: "battle", turn: 0 }),
    log,
    aiThinking: false,
    stats: computeBattleStats(log, { ownSeat: 0, startedAt: 0, endedAt: null, now: 0 }),
    revealedEnemyFleet: null,
  };
  const noop = () => {};
  render(
    <BattleScreen
      snapshot={snapshot}
      operation="Operación Test"
      opponent={{ kind: "human", alias: "Bruno" }}
      commanderComments={false}
      motion={motionTokens(true)}
      reducedMotion
      confirmShot={false}
      compact={false}
      showBlocked={false}
      effects={{ play: noop, setIntensity: noop, vibrate: noop }}
      onFire={noop}
      onLeave={noop}
      onFinished={noop}
    />,
  );
}

const items = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("BattleScreen · combat log", () => {
  it("keeps the last 10 shots of each side, newest first, with coordinate and result", () => {
    renderBattle(alternatingLog());
    const own = items("Mis disparos");
    const enemy = items("Disparos enemigos");
    expect(own).toHaveLength(10);
    expect(enemy).toHaveLength(10);
    // Newest own shot: B-3 (12th shot); oldest kept: C-1 (3rd shot).
    expect(own[0]).toMatch(/B-3.*agua/);
    expect(own[9]).toMatch(/C-1.*agua/);
    expect(enemy[0]).toMatch(/B-4.*impacto/);
    expect(enemy[9]).toMatch(/C-2.*impacto/);
  });

  it("names the sunk ship in the log", () => {
    renderBattle([
      { id: 0, seat: 0, coord: { col: 2, row: 6 }, result: "sunk", shipId: "carrier" },
    ]);
    expect(items("Mis disparos")[0]).toMatch(/C-7.*hundido · Portaaviones/);
    expect(
      within(screen.getByRole("region", { name: "Registro de combate" })).getByText(
        "Sin disparos todavía.",
      ),
    ).toBeInTheDocument();
  });
});
