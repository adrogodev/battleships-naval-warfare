import { DEFAULT_RULES, type Placement } from "@battleships/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { LocalAiGame } from "../adapters/localAiGame";
import { t } from "../i18n/es";
import { BattleScreen } from "../screens/BattleScreen";
import { DeployScreen } from "../screens/DeployScreen";
import { ResultsScreen } from "../screens/ResultsScreen";

export interface AppProps {
  /** AI "thinking" delay; reducible for tests and reduced-motion later. */
  readonly thinkDelayMs?: { min: number; max: number };
  readonly seed?: () => number;
}

type Screen = "menu" | "deploy" | "battle";

const DEFAULT_THINK_DELAY = { min: 400, max: 900 };

export function App({ thinkDelayMs = DEFAULT_THINK_DELAY, seed = Date.now }: AppProps) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [game, setGame] = useState<LocalAiGame | null>(null);

  useEffect(() => () => game?.dispose(), [game]);

  const startDeploy = useCallback(() => {
    setGame(new LocalAiGame({ difficulty: "easy", seed: seed(), thinkDelayMs }));
    setScreen("deploy");
  }, [seed, thinkDelayMs]);

  const onFleetReady = (fleet: readonly Placement[]) => {
    if (game?.submitFleet(fleet) === null) setScreen("battle");
  };

  if (screen === "menu" || game === null) {
    return (
      <main className="screen menu">
        <h1 className="menu__title">{t.appName}</h1>
        <p className="label">{t.menu.subtitle}</p>
        <button type="button" className="primary" onClick={startDeploy}>
          {t.menu.playAi}
        </button>
        <p className="dim">{t.menu.difficultyEasy}</p>
      </main>
    );
  }

  if (screen === "deploy") return <DeployScreen rules={DEFAULT_RULES} onReady={onFleetReady} />;

  return <LiveBattle game={game} onPlayAgain={startDeploy} onMenu={() => setScreen("menu")} />;
}

function LiveBattle({
  game,
  onPlayAgain,
  onMenu,
}: {
  readonly game: LocalAiGame;
  readonly onPlayAgain: () => void;
  readonly onMenu: () => void;
}) {
  const snapshot = useSyncExternalStore(game.subscribe, game.getSnapshot);
  if (snapshot.view.phase === "finished") {
    return <ResultsScreen snapshot={snapshot} onPlayAgain={onPlayAgain} onMenu={onMenu} />;
  }
  return (
    <BattleScreen
      snapshot={snapshot}
      onFire={(coord) => game.fire(coord)}
      onLeave={() => game.leave()}
    />
  );
}
