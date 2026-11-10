import {
  createRng,
  DEFAULT_RULES,
  type Difficulty,
  type GameRules,
  type Placement,
} from "@battleships/shared";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { LocalAiGame } from "../adapters/localAiGame";
import { SESSION_KEY, type SocketGame } from "../adapters/socketGame";
import type { SfxId } from "../audio";
import { type GameAudio, LazyAudio } from "../audio/lazyAudio";
import { Insignia } from "../components/Insignia";
import { RankBadge } from "../components/RankBadge";
import { t } from "../i18n/es";
import { MultiplayerFlow } from "../multiplayer/MultiplayerFlow";
import { codeFromLocation } from "../multiplayer/roomCode";
import { operationName } from "../narrative/narrative";
import { aiGameId, gameRecordFromSnapshot } from "../progress/game";
import type { ProgressReport } from "../progress/progress";
import { progressStore } from "../progress/progressStore";
import { rankForXp } from "../progress/ranks";
import { type BattleEffects, BattleScreen } from "../screens/BattleScreen";
import { DeployScreen } from "../screens/DeployScreen";
import { DifficultyScreen } from "../screens/DifficultyScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { AI_DELAY_MS, settingsStore } from "../settings/settingsStore";
import { applyMotionTokens, type MotionTokens, motionTokens } from "../theme/motion";
import { TutorialScreen } from "../tutorial/TutorialScreen";
import { vibrate } from "./haptics";
import {
  useCompactLayout,
  useConfirmShot,
  useProgress,
  useReducedMotion,
  useSettings,
} from "./useEnvironment";

export interface AppProps {
  /** AI "thinking" delay; overrides the aiDelay setting (reducible for tests). */
  readonly thinkDelayMs?: { min: number; max: number };
  readonly seed?: () => number;
  readonly audio?: GameAudio;
  /** Multiplayer adapter factory (a fake socket in tests). */
  readonly createMultiplayerGame?: () => SocketGame;
}

type Screen =
  | "boot"
  | "menu"
  | "settings"
  | "stats"
  | "tutorial"
  | "difficulty"
  | "deploy"
  | "battle"
  | "results"
  | "multiplayer";

/** A session token in this tab means a reload in the middle of an online game: rejoin it. */
function hasOnlineSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

const defaultAudio = new LazyAudio();

// Decoration loads after the first paint: the game is playable before the canvases arrive.
const OceanBackground = lazy(() =>
  import("../fx/ocean/OceanBackground").then((m) => ({ default: m.OceanBackground })),
);
const FxLayer = lazy(() => import("../fx/particles/FxLayer").then((m) => ({ default: m.FxLayer })));

export function App({
  thinkDelayMs,
  seed = Date.now,
  audio = defaultAudio,
  createMultiplayerGame,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>("boot");
  const [joinCode, setJoinCode] = useState(() => codeFromLocation(window.location.search));
  const [game, setGame] = useState<LocalAiGame | null>(null);
  /** Rules of the AI game being set up: deploy and the game must agree on them. */
  const [rules, setRules] = useState<GameRules>(DEFAULT_RULES);
  const [operation, setOperation] = useState("");
  const [gameId, setGameId] = useState("");
  const [report, setReport] = useState<ProgressReport | null>(null);
  const settings = useSettings();
  const progress = useProgress();
  const rank = rankForXp(progress.xp);
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.lastDifficulty);
  const reducedMotion = useReducedMotion(settings);
  const confirmShot = useConfirmShot(settings);
  const compact = useCompactLayout();
  const motion = motionTokens(reducedMotion);

  useEffect(() => {
    applyMotionTokens(motion, document.documentElement);
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
  }, [motion, reducedMotion]);
  useEffect(() => {
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
    document.documentElement.dataset.palette = settings.colorblind ? "colorblind" : "default";
  }, [settings.highContrast, settings.colorblind]);
  useEffect(() => audio.setMix(settings.mix), [audio, settings.mix]);
  useEffect(() => audio.setAmbient(settings.ambientEnabled), [audio, settings.ambientEnabled]);
  useEffect(() => {
    const onVisibility = () => (document.hidden ? audio.suspend() : audio.resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [audio]);
  useEffect(() => () => game?.dispose(), [game]);

  const play = useCallback((id: SfxId) => audio.play(id), [audio]);
  const effects = useMemo<BattleEffects>(
    () => ({
      play,
      setIntensity: (level) => audio.setIntensity(level),
      // Read at call time so a settings change applies to the next cue.
      vibrate: (cue) => vibrate(cue, settingsStore.get().vibration),
    }),
    [audio, play],
  );

  // Never wait for audio: a browser may keep resume() pending (no trusted gesture, hidden tab).
  const boot = () => {
    setScreen(joinCode !== null || hasOnlineSession() ? "multiplayer" : "menu");
    void audio.unlock().then(() => audio.startMusic());
  };

  const startDeploy = (chosen: Difficulty) => {
    const gameSeed = seed();
    setDifficulty(chosen);
    // Read at call time: the setting may have changed since the last render.
    const current = settingsStore.get();
    const delay = thinkDelayMs ?? AI_DELAY_MS[current.aiDelay];
    const gameRules = { ...DEFAULT_RULES, noContact: current.noContactRule };
    setRules(gameRules);
    setGame(
      new LocalAiGame({
        difficulty: chosen,
        seed: gameSeed,
        thinkDelayMs: delay,
        rules: gameRules,
      }),
    );
    setGameId(aiGameId(gameSeed));
    setReport(null);
    setOperation(operationName(createRng(gameSeed ^ 0x5eed)));
    audio.setIntensity(0);
    setScreen("deploy");
  };

  const chooseDifficulty = (chosen: Difficulty) => {
    play("click");
    settingsStore.update({ lastDifficulty: chosen });
    startDeploy(chosen);
  };

  const onFleetReady = (fleet: readonly Placement[]) => {
    if (game?.submitFleet(fleet) === null) {
      play("turn");
      setScreen("battle");
    }
  };

  const toMenu = () => {
    audio.setIntensity(0);
    setScreen("menu");
  };

  /** Counts the finished local game once (rank XP, statistics, challenges), then shows results. */
  const onBattleFinished = () => {
    if (game) {
      const record = gameRecordFromSnapshot(game.getSnapshot(), {
        id: gameId,
        mode: "ai",
        difficulty,
      });
      const recorded = progressStore.recordGame(record);
      if (recorded) setReport(recorded);
    }
    setScreen("results");
  };

  let content: ReactNode;
  if (screen === "boot") {
    content = (
      <main className="screen boot">
        <Logo />
        <button type="button" className="primary boot__start" onClick={boot}>
          {t.boot.start}
        </button>
        <p className="hint">{t.boot.hint}</p>
      </main>
    );
  } else if (screen === "settings") {
    content = (
      <SettingsScreen
        settings={settings}
        onBack={() => {
          play("click");
          setScreen("menu");
        }}
      />
    );
  } else if (screen === "stats") {
    content = (
      <StatsScreen
        progress={progress}
        onBack={() => {
          play("click");
          setScreen("menu");
        }}
      />
    );
  } else if (screen === "tutorial") {
    content = (
      <TutorialScreen
        motion={motion}
        reducedMotion={reducedMotion}
        play={play}
        onExit={() => {
          play("click");
          setScreen("menu");
        }}
      />
    );
  } else if (screen === "difficulty") {
    content = (
      <DifficultyScreen
        lastDifficulty={settings.lastDifficulty}
        onSelect={chooseDifficulty}
        onBack={() => {
          play("click");
          setScreen("menu");
        }}
      />
    );
  } else if (screen === "multiplayer") {
    content = (
      <MultiplayerFlow
        initialCode={joinCode}
        {...(createMultiplayerGame ? { createGame: createMultiplayerGame } : {})}
        motion={motion}
        reducedMotion={reducedMotion}
        confirmShot={confirmShot}
        compact={compact}
        showBlocked={settings.showBlocked}
        effects={effects}
        play={play}
        onMenu={() => {
          setJoinCode(null);
          toMenu();
        }}
      />
    );
  } else if (screen === "menu" || game === null) {
    const remembered = t.commanders[settings.lastDifficulty];
    content = (
      <main className="screen menu">
        <Logo />
        <p className="label">{t.menu.subtitle}</p>
        <nav className="menu__actions" aria-label={t.appName}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              play("click");
              setScreen("difficulty");
            }}
          >
            {t.menu.playAi}
          </button>
          <button
            type="button"
            onClick={() => {
              play("click");
              setScreen("multiplayer");
            }}
          >
            {t.menu.multiplayer}
          </button>
          <button
            type="button"
            onClick={() => {
              play("click");
              setScreen("tutorial");
            }}
          >
            {t.menu.howToPlay}
          </button>
          <button
            type="button"
            onClick={() => {
              play("click");
              setScreen("stats");
            }}
          >
            {t.menu.stats}
          </button>
          <button
            type="button"
            onClick={() => {
              play("click");
              setScreen("settings");
            }}
          >
            {t.menu.settings}
          </button>
        </nav>
        <p className="menu__rank">
          <RankBadge index={rank.index} className="menu__rank-badge" />
          <span>
            <span className="label">{t.menu.rank}</span>
            <br />
            <strong>{t.progress.ranks[rank.id]}</strong>{" "}
            <span className="num dim">· {t.progress.xp(progress.xp)}</span>
          </span>
        </p>
        <p className="dim menu__rival">
          <Insignia rank={settings.lastDifficulty} className="menu__insignia" />
          {t.menu.lastRival(remembered.name, remembered.difficulty)}
        </p>
      </main>
    );
  } else if (screen === "deploy") {
    content = <DeployScreen rules={rules} onReady={onFleetReady} play={play} />;
  } else {
    content = (
      <LiveBattle
        game={game}
        screen={screen}
        operation={operation}
        motion={motion}
        reducedMotion={reducedMotion}
        confirmShot={confirmShot}
        compact={compact}
        showBlocked={settings.showBlocked}
        commanderComments={settings.commanderComments}
        difficulty={difficulty}
        effects={effects}
        report={report}
        onFinished={onBattleFinished}
        onPlayAgain={() => startDeploy(difficulty)}
        onMenu={toMenu}
      />
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <OceanBackground reducedMotion={reducedMotion} />
      </Suspense>
      {content}
      <Suspense fallback={null}>
        <FxLayer enabled={!reducedMotion} />
      </Suspense>
    </>
  );
}

function Logo() {
  return (
    <div className="logo">
      <svg className="logo__mark" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
        <circle cx="17" cy="17" r="15" className="logo__ring" />
        <circle cx="17" cy="17" r="8" className="logo__inner" />
        <path d="M17 2 V32 M2 17 H32" className="logo__cross" />
        <path d="M17 17 L28 7" className="logo__needle" />
      </svg>
      <h1 className="logo__name">
        {t.appName}
        <span className="logo__tagline">{t.appTagline}</span>
      </h1>
    </div>
  );
}

function LiveBattle({
  game,
  screen,
  onPlayAgain,
  onMenu,
  difficulty,
  report,
  ...battle
}: {
  readonly game: LocalAiGame;
  readonly screen: Screen;
  readonly report: ProgressReport | null;
  readonly operation: string;
  readonly motion: MotionTokens;
  readonly reducedMotion: boolean;
  readonly confirmShot: boolean;
  readonly compact: boolean;
  readonly showBlocked: boolean;
  readonly commanderComments: boolean;
  readonly difficulty: Difficulty;
  readonly effects: BattleEffects;
  readonly onFinished: () => void;
  readonly onPlayAgain: () => void;
  readonly onMenu: () => void;
}) {
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot);
  if (screen === "results") {
    return (
      <ResultsScreen
        snapshot={snapshot}
        onPlayAgain={onPlayAgain}
        onMenu={onMenu}
        progress={report}
      />
    );
  }
  return (
    <BattleScreen
      {...battle}
      opponent={{ kind: "ai", difficulty }}
      snapshot={snapshot}
      onFire={(coord) => game.fire(coord)}
      onLeave={() => game.leave()}
    />
  );
}
