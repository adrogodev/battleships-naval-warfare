import { type ChangeEvent, useState } from "react";
import { hapticsSupported } from "../app/haptics";
import { t } from "../i18n/es";
import { clearAllData } from "../progress/progressStore";
import { type Settings, settingsStore } from "../settings/settingsStore";

interface SettingsScreenProps {
  readonly settings: Settings;
  readonly onBack: () => void;
}

const percent = (value: number) => Math.round(value * 100);

export function SettingsScreen({ settings, onBack }: SettingsScreenProps) {
  const setMix = (key: "music" | "sfx" | "ambient") => (event: ChangeEvent<HTMLInputElement>) =>
    settingsStore.update({ mix: { ...settings.mix, [key]: Number(event.target.value) / 100 } });
  const vibrationAvailable = hapticsSupported();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <main className="screen settings">
      <h1 className="screen__title">{t.settings.title}</h1>

      <section className="panel settings__group" aria-labelledby="audio-title">
        <h2 id="audio-title" className="label">
          {t.settings.audio}
        </h2>
        {(["music", "sfx", "ambient"] as const).map((key) => (
          <label key={key} className="settings__slider">
            <span>{t.settings[key]}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent(settings.mix[key])}
              onChange={setMix(key)}
            />
            <span className="num">{percent(settings.mix[key])}%</span>
          </label>
        ))}
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.mix.muted}
            onChange={(event) =>
              settingsStore.update({ mix: { ...settings.mix, muted: event.target.checked } })
            }
          />
          {t.settings.mute}
        </label>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.ambientEnabled}
            onChange={(event) => settingsStore.update({ ambientEnabled: event.target.checked })}
          />
          {t.settings.ambientEnabled}
        </label>
      </section>

      <section className="panel settings__group" aria-labelledby="feel-title">
        <h2 id="feel-title" className="label">
          {t.settings.motion} · {t.settings.vibration}
        </h2>
        <label className="settings__select">
          <span>{t.settings.motion}</span>
          <select
            value={settings.motion}
            onChange={(event) =>
              settingsStore.update({ motion: event.target.value as Settings["motion"] })
            }
          >
            <option value="system">{t.settings.motionSystem}</option>
            <option value="reduced">{t.settings.motionReduced}</option>
            <option value="full">{t.settings.motionFull}</option>
          </select>
        </label>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.vibration && vibrationAvailable}
            disabled={!vibrationAvailable}
            onChange={(event) => settingsStore.update({ vibration: event.target.checked })}
          />
          {t.settings.vibration}
        </label>
        {!vibrationAvailable && <p className="hint">{t.settings.vibrationUnsupported}</p>}
      </section>

      <section className="panel settings__group" aria-labelledby="gameplay-title">
        <h2 id="gameplay-title" className="label">
          {t.settings.gameplay}
        </h2>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.showBlocked}
            onChange={(event) => settingsStore.update({ showBlocked: event.target.checked })}
          />
          {t.settings.showBlocked}
        </label>
        <label className="settings__select">
          <span>{t.settings.confirmShot}</span>
          <select
            value={settings.confirmShot}
            onChange={(event) =>
              settingsStore.update({ confirmShot: event.target.value as Settings["confirmShot"] })
            }
          >
            <option value="auto">{t.settings.confirmAuto}</option>
            <option value="always">{t.settings.confirmAlways}</option>
            <option value="never">{t.settings.confirmNever}</option>
          </select>
        </label>
      </section>

      <section className="panel settings__group" aria-labelledby="rival-title">
        <h2 id="rival-title" className="label">
          {t.settings.rival}
        </h2>
        <label className="settings__select">
          <span>{t.settings.aiDelay}</span>
          <select
            value={settings.aiDelay}
            onChange={(event) =>
              settingsStore.update({ aiDelay: event.target.value as Settings["aiDelay"] })
            }
          >
            <option value="normal">{t.settings.aiDelayNormal}</option>
            <option value="fast">{t.settings.aiDelayFast}</option>
          </select>
        </label>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.commanderComments}
            onChange={(event) => settingsStore.update({ commanderComments: event.target.checked })}
          />
          {t.settings.commanderComments}
        </label>
      </section>

      <section className="panel settings__group" aria-labelledby="data-title">
        <h2 id="data-title" className="label">
          {t.settings.data}
        </h2>
        <p className="hint">{t.settings.deleteDataHint}</p>
        {confirmingDelete ? (
          <div className="confirm" role="alertdialog" aria-label={t.settings.deleteConfirm}>
            <p>{t.settings.deleteConfirm}</p>
            <div className="settings__actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  clearAllData();
                  setConfirmingDelete(false);
                  setDeleted(true);
                }}
              >
                {t.settings.deleteYes}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                {t.settings.deleteNo}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ghost settings__delete"
            onClick={() => {
              setDeleted(false);
              setConfirmingDelete(true);
            }}
          >
            {t.settings.deleteData}
          </button>
        )}
        <p className="hint" role="status">
          {deleted ? t.settings.deleted : ""}
        </p>
      </section>

      <div className="settings__actions">
        <button type="button" onClick={() => settingsStore.clear()}>
          {t.settings.reset}
        </button>
        <button type="button" className="primary" onClick={onBack}>
          {t.settings.back}
        </button>
      </div>
    </main>
  );
}
