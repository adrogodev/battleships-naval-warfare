import {
  allCoords,
  createRng,
  DEFAULT_RULES,
  type Difficulty,
  randomFleet,
  validateFleet,
} from "@battleships/shared";
import { describe, expect, it } from "vitest";
import { LocalAiGame, type Scheduler } from "./localAiGame";

/** Records scheduled callbacks so a test decides when the AI "finishes thinking". */
function manualScheduler() {
  const queue: { fn: () => void; ms: number }[] = [];
  const scheduler: Scheduler = (fn, ms) => {
    const task = { fn, ms };
    queue.push(task);
    return () => {
      const index = queue.indexOf(task);
      if (index >= 0) queue.splice(index, 1);
    };
  };
  const flush = () => {
    while (queue.length > 0) queue.shift()?.fn();
  };
  return { scheduler, queue, flush };
}

function startGame(seed = 1, difficulty: Difficulty = "easy") {
  const clock = manualScheduler();
  const game = new LocalAiGame({
    difficulty,
    seed,
    thinkDelayMs: { min: 400, max: 900 },
    schedule: clock.scheduler,
  });
  game.submitFleet(randomFleet(DEFAULT_RULES, createRng(seed + 1000)));
  return { game, clock };
}

describe("LocalAiGame", () => {
  it("starts the battle with the human to move once the fleet is submitted", () => {
    const { game } = startGame();
    const snapshot = game.getSnapshot();
    expect(snapshot.view.phase).toBe("battle");
    expect(snapshot.view.turn).toBe(0);
    expect(snapshot.aiThinking).toBe(false);
    expect(snapshot.revealedEnemyFleet).toBeNull();
  });

  it("makes the AI think for 400-900 ms and blocks the human meanwhile", () => {
    const { game, clock } = startGame();
    expect(game.fire({ col: 0, row: 0 })).toBeNull();
    expect(game.getSnapshot().aiThinking).toBe(true);
    expect(clock.queue).toHaveLength(1);
    expect(clock.queue[0]?.ms).toBeGreaterThanOrEqual(400);
    expect(clock.queue[0]?.ms).toBeLessThanOrEqual(900);
    expect(game.fire({ col: 1, row: 0 })).toBe("not_your_turn");
    clock.flush();
    expect(game.getSnapshot().aiThinking).toBe(false);
    expect(game.getSnapshot().view.turn).toBe(0);
    expect(game.getSnapshot().log.map((entry) => entry.seat)).toEqual([0, 1]);
  });

  it("rejects a repeated shot", () => {
    const { game, clock } = startGame();
    game.fire({ col: 3, row: 3 });
    clock.flush();
    expect(game.fire({ col: 3, row: 3 })).toBe("already_fired");
  });

  it("plays a whole game to the end and reports stats", () => {
    const { game, clock } = startGame(7);
    for (const coord of allCoords(10)) {
      if (game.getSnapshot().view.phase === "finished") break;
      expect(game.fire(coord)).toBeNull();
      clock.flush();
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.view.phase).toBe("finished");
    expect(snapshot.view.winner).not.toBeNull();
    expect(snapshot.stats.shots).toBeGreaterThanOrEqual(17);
    expect(snapshot.stats.hits).toBeLessThanOrEqual(17);
    expect(snapshot.stats.accuracy).toBeCloseTo(snapshot.stats.hits / snapshot.stats.shots);
    expect(clock.queue).toHaveLength(0);
    expect(snapshot.revealedEnemyFleet).toHaveLength(5);
  });

  it("notifies subscribers and stops the AI on dispose", () => {
    const { game, clock } = startGame();
    let calls = 0;
    const unsubscribe = game.subscribe(() => {
      calls++;
    });
    game.fire({ col: 5, row: 5 });
    expect(calls).toBeGreaterThan(0);
    game.dispose();
    expect(clock.queue).toHaveLength(0);
    unsubscribe();
  });

  it.each(["normal", "hard"] as const)("plays a whole game against the %s AI", (difficulty) => {
    const { game, clock } = startGame(11, difficulty);
    for (const coord of allCoords(10)) {
      if (game.getSnapshot().view.phase === "finished") break;
      expect(game.fire(coord)).toBeNull();
      clock.flush();
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.view.phase).toBe("finished");
    expect(snapshot.view.winner).not.toBeNull();
    expect(clock.queue).toHaveLength(0);
    const aiFleet = snapshot.revealedEnemyFleet ?? [];
    expect(validateFleet(aiFleet, DEFAULT_RULES)).toEqual({ ok: true });
    const aiShots = snapshot.log.filter((entry) => entry.seat === 1);
    expect(new Set(aiShots.map((e) => `${e.coord.col}:${e.coord.row}`)).size).toBe(aiShots.length);
  });
});
