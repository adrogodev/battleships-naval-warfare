import { columnLetter, coordLabel, DIFFICULTIES } from "@battleships/shared";
import type { CSSProperties } from "react";
import { ChallengeBadge, RankBadge } from "../components/RankBadge";
import { t } from "../i18n/es";
import { CHALLENGES } from "../progress/challenges";
import { averageAccuracy, HEATMAP_SIZE, type PlayerProgress } from "../progress/progress";
import { RANKS, rankForXp } from "../progress/ranks";

interface StatsScreenProps {
  readonly progress: PlayerProgress;
  readonly onBack: () => void;
}

const AXIS = Array.from({ length: HEATMAP_SIZE }, (_, index) => index);

/** Personal statistics, commander rank, shot heatmap and challenges (S1–S3). */
export function StatsScreen({ progress, onBack }: StatsScreenProps) {
  const rank = rankForXp(progress.xp);
  const next = RANKS[rank.index + 1];
  const accuracy = averageAccuracy(progress);
  const hottest = Math.max(1, ...progress.heatmap);
  const done = CHALLENGES.filter((challenge) => progress.completed.includes(challenge.id)).length;

  return (
    <main className="screen stats">
      <h1 className="screen__title">{t.stats.title}</h1>

      <section className="panel stats__rank" aria-labelledby="stats-rank-title">
        <h2 id="stats-rank-title" className="label">
          {t.stats.rank}
        </h2>
        <div className="stats__rank-body">
          <RankBadge index={rank.index} className="stats__badge" />
          <div>
            <p className="stats__rank-name">{t.progress.ranks[rank.id]}</p>
            <p className="num">{t.progress.xp(progress.xp)}</p>
            <div className="xpbar" aria-hidden="true">
              <span className="xpbar__fill" style={{ "--xp": rank.progress } as CSSProperties} />
            </div>
            <p className="hint">
              {next
                ? t.progress.toNext(next.minXp - progress.xp, t.progress.ranks[next.id])
                : t.progress.topRank}
            </p>
          </div>
        </div>
      </section>

      {progress.games === 0 && <p className="hint">{t.stats.empty}</p>}

      <section className="panel" aria-labelledby="stats-summary-title">
        <h2 id="stats-summary-title" className="label">
          {t.stats.summary}
        </h2>
        <dl className="results__stats stats__summary">
          <div>
            <dt className="label">{t.stats.games}</dt>
            <dd className="num">{progress.games}</dd>
          </div>
          <div>
            <dt className="label">{t.stats.wins}</dt>
            <dd className="num">{progress.wins}</dd>
          </div>
          <div>
            <dt className="label">{t.stats.averageAccuracy}</dt>
            <dd className="num">
              {accuracy === null ? t.stats.none : `${Math.round(accuracy * 100)}%`}
            </dd>
          </div>
          <div>
            <dt className="label">{t.stats.bestStreak}</dt>
            <dd className="num">{progress.bestStreak}</dd>
          </div>
          <div>
            <dt className="label">{t.stats.shortestWin}</dt>
            <dd className="num">
              {progress.shortestWinShots === null
                ? t.stats.none
                : t.stats.shortestWinValue(progress.shortestWinShots)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <table className="stats__table">
          <caption className="label">{t.stats.byMode}</caption>
          <thead>
            <tr>
              <th scope="col">{t.stats.mode}</th>
              <th scope="col">{t.stats.played}</th>
              <th scope="col">{t.stats.won}</th>
            </tr>
          </thead>
          <tbody>
            {DIFFICULTIES.map((difficulty) => (
              <tr key={difficulty}>
                <th scope="row">
                  {t.commanders[difficulty].difficulty} · {t.commanders[difficulty].name}
                </th>
                <td className="num">{progress.byMode.ai[difficulty].played}</td>
                <td className="num">{progress.byMode.ai[difficulty].won}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t.stats.online}</th>
              <td className="num">{progress.byMode.online.played}</td>
              <td className="num">{progress.byMode.online.won}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <table className="heatmap" aria-describedby="heatmap-hint">
          <caption className="label">{t.stats.heatmap}</caption>
          <thead>
            <tr>
              <td />
              {AXIS.map((col) => (
                <th key={col} scope="col">
                  {columnLetter(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AXIS.map((row) => (
              <tr key={row}>
                <th scope="row">{row + 1}</th>
                {AXIS.map((col) => {
                  const shots = progress.heatmap[row * HEATMAP_SIZE + col] ?? 0;
                  return (
                    <td
                      key={col}
                      className="heatmap__cell"
                      style={{ "--heat": shots / hottest } as CSSProperties}
                      aria-label={t.stats.heatmapCell(coordLabel({ col, row }), shots)}
                    >
                      {shots > 0 ? shots : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p id="heatmap-hint" className="hint">
          {t.stats.heatmapHint}
        </p>
      </section>

      <section className="panel" aria-labelledby="stats-challenges-title">
        <h2 id="stats-challenges-title" className="label">
          {t.stats.challenges} · {t.stats.challengesCount(done, CHALLENGES.length)}
        </h2>
        <ul className="challenges" aria-label={t.stats.challenges}>
          {CHALLENGES.map((challenge) => {
            const completed = progress.completed.includes(challenge.id);
            const copy = t.progress.challenges[challenge.id];
            return (
              <li
                key={challenge.id}
                className={`challenge ${completed ? "is-completed" : "is-locked"}`}
              >
                <ChallengeBadge completed={completed} />
                <span>
                  <span className="challenge__title">{copy.title}</span>
                  <br />
                  <span className="dim">
                    {completed ? `${t.stats.completed} · ${copy.badge}` : t.stats.locked}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="settings__actions">
        <button type="button" className="primary" onClick={onBack}>
          {t.stats.back}
        </button>
      </div>
    </main>
  );
}
