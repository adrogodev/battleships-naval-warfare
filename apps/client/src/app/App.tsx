import { createRng, DEFAULT_RULES, type Placement } from "@battleships/shared";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { LocalAiGame } from "../adapters/localAiGame";
import { AudioEngine, type SfxId } from "../audio";
import { FxLayer, OceanBackground } from "../fx";
import { t } from "../i18n/es";
import { operationName } from "../narrative/narrative";
import { type BattleEffects, BattleScreen } from "../screens/BattleScreen";
import { DeployScreen } from "../screens/DeployScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { settingsStore } from "../settings/settingsStore";
import { applyMotionTokens, type MotionTokens, motionTokens } from "../theme/motion";
import { vibrate } from "./haptics";
import { useCompactLayout, useConfirmShot, useReducedMotion, useSettings } from "./useEnvironment";

export interface AppProps {
  /** AI "thinking" delay; reducible for tests. */
  readonly thinkDelayMs?: { min: number; max: number };
  readonly seed?: () => number;
  readonly audio?: AudioEngine;
}

type Screen = "boot" | "menu" | "settings" | "deploy" | "battle" | "results";

const DEFAULT_THINK_DELAY = { min: 400, max: 900 };
const defaultAudio = new AudioEngine();

export function App({
  thinkDelayMs = DEFAULT_THINK_DELAY,
  seed = Date.now,
  audio = defaultAudio,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>("boot");
  const [game, setGame] = useState<LocalAiGame | null>(null);
  const [operation, setOperation] = useState("");
  const settings = useSettings();
  const reducedMotion = useReducedMotion(settings);
  const confirmShot = useConfirmShot(settings);
  const compact = useCompactLayout();
  const motion = motionTokens(reducedMotion);

  useEffect(() => {
    applyMotionTokens(motion, document.documentElement);
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
  }, [motion, reducedMotion]);
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

  const boot = async () => {
    await audio.unlock();
    audio.startMusic();
    setScreen("menu");
  };

  const startDeploy = () => {
    const gameSeed = seed();
    setGame(new LocalAiGame({ difficulty: "easy", seed: gameSeed, thinkDelayMs }));
    setOperation(operationName(createRng(gameSeed ^ 0x5eed)));
    audio.setIntensity(0);
    setScreen("deploy");
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
  } else if (screen === "menu" || game === null) {
    content = (
      <main className="screen menu">
        <Logo />
        <p className="label">{t.menu.subtitle}</p>
        <nav className="menu__actions" aria-label={t.appName}>
          <button type="button" className="primary" onClick={startDeploy}>
            {t.menu.playAi}
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
        <p className="dim">{t.menu.difficultyEasy}</p>
      </main>
    );
  } else if (screen === "deploy") {
    content = <DeployScreen rules={DEFAULT_RULES} onReady={onFleetReady} play={play} />;
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
        effects={effects}
        onFinished={() => setScreen("results")}
        onPlayAgain={startDeploy}
        onMenu={toMenu}
      />
    );
  }

  return (
    <>
      <OceanBackground reducedMotion={reducedMotion} />
      {content}
      <FxLayer enabled={!reducedMotion} />
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
  ...battle
}: {
  readonly game: LocalAiGame;
  readonly screen: Screen;
  readonly operation: string;
  readonly motion: MotionTokens;
  readonly reducedMotion: boolean;
  readonly confirmShot: boolean;
  readonly compact: boolean;
  readonly showBlocked: boolean;
  readonly effects: BattleEffects;
  readonly onFinished: () => void;
  readonly onPlayAgain: () => void;
  readonly onMenu: () => void;
}) {
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot);
  if (screen === "results") {
    return <ResultsScreen snapshot={snapshot} onPlayAgain={onPlayAgain} onMenu={onMenu} />;
  }
  return (
    <BattleScreen
      {...battle}
      snapshot={snapshot}
      opponent={t.commanders.easy.name}
      onFire={(coord) => game.fire(coord)}
      onLeave={() => game.leave()}
    />
  );
}
