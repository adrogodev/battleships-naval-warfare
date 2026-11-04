import {
  type ActionError,
  type AiPlayer,
  type Coord,
  createAi,
  createGame,
  createRng,
  DEFAULT_RULES,
  type Difficulty,
  type FleetError,
  type GameEvent,
  type GameRules,
  type GameState,
  type Placement,
  type PlayerView,
  publicBoardView,
  type Rng,
  reduce,
  type Seat,
  type ShipId,
  viewFor,
} from "@battleships/shared";

export type Scheduler = (fn: () => void, ms: number) => () => void;

const defaultScheduler: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export interface LogEntry {
  readonly id: number;
  readonly seat: Seat;
  readonly coord: Coord;
  readonly result: "miss" | "hit" | "sunk";
  readonly shipId?: ShipId;
}

export interface BattleStats {
  readonly shots: number;
  readonly hits: number;
  readonly accuracy: number;
  readonly maxStreak: number;
  readonly firstSinkTurn: number | null;
  readonly durationMs: number;
}

export interface GameSnapshot {
  readonly view: PlayerView;
  readonly log: readonly LogEntry[];
  readonly aiThinking: boolean;
  readonly stats: BattleStats;
  /** The AI fleet, revealed only once the game is over (final maps). */
  readonly revealedEnemyFleet: readonly Placement[] | null;
}

export interface LocalAiGameOptions {
  difficulty: Difficulty;
  seed: number;
  thinkDelayMs: { min: number; max: number };
  rules?: GameRules;
  schedule?: Scheduler;
  now?: () => number;
}

const HUMAN: Seat = 0;
const AI: Seat = 1;

/**
 * Single-player adapter: runs the shared state machine in the browser with the human on seat 0
 * and the AI on seat 1. The AI only ever receives `publicBoardView` of the human board.
 */
export class LocalAiGame {
  private state: GameState;
  private readonly ai: AiPlayer;
  private readonly rng: Rng;
  private readonly schedule: Scheduler;
  private readonly now: () => number;
  private readonly thinkDelayMs: { min: number; max: number };
  private readonly listeners = new Set<() => void>();
  private log: LogEntry[] = [];
  private aiThinking = false;
  private cancelAiTurn: (() => void) | null = null;
  private battleStartedAt: number | null = null;
  private battleEndedAt: number | null = null;
  private snapshot: GameSnapshot;

  constructor(options: LocalAiGameOptions) {
    this.ai = createAi(options.difficulty);
    this.rng = createRng(options.seed);
    this.schedule = options.schedule ?? defaultScheduler;
    this.now = options.now ?? Date.now;
    this.thinkDelayMs = options.thinkDelayMs;

    let state = createGame(options.rules ?? DEFAULT_RULES, { firstTurn: HUMAN });
    state = this.mustApply(state, { type: "join", seat: HUMAN });
    state = this.mustApply(state, { type: "join", seat: AI });
    const aiFleet = this.ai.placeFleet(state.rules, this.rng);
    this.state = this.mustApply(state, { type: "submitFleet", seat: AI, fleet: aiFleet });
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  submitFleet(fleet: readonly Placement[]): FleetError | ActionError | null {
    const result = reduce(this.state, { type: "submitFleet", seat: HUMAN, fleet });
    if (!result.ok) return result.detail ?? result.error;
    this.state = result.state;
    this.battleStartedAt = this.now();
    this.emit();
    return null;
  }

  /** Returns null when the shot was accepted, or the reason it was rejected. */
  fire(coord: Coord): ActionError | null {
    if (this.aiThinking) return "not_your_turn";
    const error = this.applyShot(HUMAN, coord);
    if (error) return error;
    this.scheduleAiTurnIfNeeded();
    this.emit();
    return null;
  }

  /** Abandons the battle: the AI wins by forfeit. */
  leave(): void {
    this.cancelPendingAiTurn();
    const result = reduce(this.state, { type: "leave", seat: HUMAN });
    if (result.ok) this.state = result.state;
    this.battleEndedAt ??= this.now();
    this.emit();
  }

  dispose(): void {
    this.cancelPendingAiTurn();
    this.listeners.clear();
  }

  private applyShot(seat: Seat, coord: Coord): ActionError | null {
    const result = reduce(this.state, { type: "fire", seat, coord });
    if (!result.ok) return result.error;
    this.state = result.state;
    this.record(result.events);
    if (this.state.phase === "finished") this.battleEndedAt = this.now();
    return null;
  }

  private scheduleAiTurnIfNeeded(): void {
    if (this.state.phase !== "battle" || this.state.turn !== AI) return;
    this.aiThinking = true;
    const { min, max } = this.thinkDelayMs;
    const delay = min + Math.floor(this.rng() * (max - min + 1));
    this.cancelAiTurn = this.schedule(() => {
      this.cancelAiTurn = null;
      const coord = this.ai.chooseShot(
        publicBoardView(this.state, HUMAN),
        this.state.rules,
        this.rng,
      );
      this.applyShot(AI, coord);
      this.aiThinking = false;
      // With the extra-turn variant the AI may keep the turn.
      this.scheduleAiTurnIfNeeded();
      this.emit();
    }, delay);
  }

  private cancelPendingAiTurn(): void {
    this.cancelAiTurn?.();
    this.cancelAiTurn = null;
    this.aiThinking = false;
  }

  private record(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type !== "shotResolved") continue;
      const entry: LogEntry =
        event.result === "sunk"
          ? {
              id: this.log.length,
              seat: event.seat,
              coord: event.coord,
              result: "sunk",
              shipId: event.shipId,
            }
          : { id: this.log.length, seat: event.seat, coord: event.coord, result: event.result };
      this.log = [...this.log, entry];
    }
  }

  private mustApply(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
    const result = reduce(state, action);
    if (!result.ok) throw new Error(`Local game setup failed: ${result.error}`);
    return result.state;
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): GameSnapshot {
    return {
      view: viewFor(this.state, HUMAN),
      log: this.log,
      aiThinking: this.aiThinking,
      stats: this.computeStats(),
      revealedEnemyFleet:
        this.state.phase === "finished" ? (this.state.players[AI].fleet ?? null) : null,
    };
  }

  private computeStats(): BattleStats {
    const own = this.log.filter((entry) => entry.seat === HUMAN);
    let streak = 0;
    let maxStreak = 0;
    let hits = 0;
    let firstSinkTurn: number | null = null;
    for (const [index, entry] of own.entries()) {
      if (entry.result === "miss") {
        streak = 0;
        continue;
      }
      hits++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      if (entry.result === "sunk" && firstSinkTurn === null) firstSinkTurn = index + 1;
    }
    const end = this.battleEndedAt ?? this.now();
    return {
      shots: own.length,
      hits,
      accuracy: own.length === 0 ? 0 : hits / own.length,
      maxStreak,
      firstSinkTurn,
      durationMs: this.battleStartedAt === null ? 0 : end - this.battleStartedAt,
    };
  }
}
