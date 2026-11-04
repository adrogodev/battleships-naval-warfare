import { DIFFICULTIES, type Difficulty } from "@battleships/shared";
import { useEffect, useRef } from "react";
import { Insignia } from "../components/Insignia";
import { t } from "../i18n/es";

interface DifficultyScreenProps {
  /** Remembered difficulty: marked and focused so replaying it is one tap or Enter away. */
  readonly lastDifficulty: Difficulty;
  readonly onSelect: (difficulty: Difficulty) => void;
  readonly onBack: () => void;
}

export function DifficultyScreen({ lastDifficulty, onSelect, onBack }: DifficultyScreenProps) {
  const lastRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    lastRef.current?.focus();
  }, []);

  return (
    <main className="screen difficulty">
      <h1 className="screen__title">{t.difficulty.title}</h1>
      <p className="hint">{t.difficulty.subtitle}</p>
      <ul className="difficulty__cards">
        {DIFFICULTIES.map((difficulty) => {
          const commander = t.commanders[difficulty];
          const last = difficulty === lastDifficulty;
          return (
            <li key={difficulty}>
              <button
                type="button"
                ref={last ? lastRef : undefined}
                className={`commander-card panel${last ? " is-last" : ""}`}
                data-difficulty={difficulty}
                onClick={() => onSelect(difficulty)}
              >
                <Insignia rank={difficulty} className="commander-card__insignia" />
                <span className="commander-card__text">
                  <span className="label">
                    {commander.difficulty}
                    {last && <span className="commander-card__tag">{t.difficulty.lastUsed}</span>}
                  </span>
                  <span className="commander-card__name">{commander.name}</span>
                  <span className="commander-card__description">{commander.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="difficulty__actions">
        <button type="button" className="ghost" onClick={onBack}>
          {t.difficulty.back}
        </button>
      </div>
    </main>
  );
}
