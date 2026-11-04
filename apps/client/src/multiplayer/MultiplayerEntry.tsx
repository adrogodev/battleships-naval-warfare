import { isValidRoomCode, normalizeAlias } from "@battleships/shared";
import { type FormEvent, useId, useState } from "react";
import { t } from "../i18n/es";
import { normalizeCodeInput } from "./roomCode";

/** Turn timer choices offered to the room creator (null: no limit). */
export const TIMER_OPTIONS = [null, 30, 60] as const;
export type TimerOption = (typeof TIMER_OPTIONS)[number];

interface MultiplayerEntryProps {
  /** Code from an invitation link: the join form comes prefilled. */
  readonly initialCode?: string | null;
  readonly initialAlias?: string;
  readonly pending: "create" | "join" | "rejoin" | null;
  readonly onCreate: (alias: string, turnTimerSec: TimerOption) => void;
  readonly onJoin: (code: string, alias: string) => void;
  readonly onBack: () => void;
}

export function MultiplayerEntry(props: MultiplayerEntryProps) {
  const id = useId();
  const copy = t.multiplayer;
  const [alias, setAlias] = useState(props.initialAlias ?? "");
  const [aliasTouched, setAliasTouched] = useState(false);
  const [timer, setTimer] = useState<TimerOption>(null);
  const [code, setCode] = useState(() => normalizeCodeInput(props.initialCode ?? ""));
  const invited = props.initialCode ? code.value : null;

  const aliasCheck = normalizeAlias(alias);
  const aliasError = aliasTouched && !aliasCheck.ok ? copy.aliasErrors[aliasCheck.reason] : null;
  const codeReady = isValidRoomCode(code.value);
  let codeError: string | null = null;
  if (code.ambiguous) codeError = copy.codeAmbiguous;
  const busy = props.pending !== null;

  const withAlias = (action: (alias: string) => void) => (event: FormEvent) => {
    event.preventDefault();
    setAliasTouched(true);
    if (!aliasCheck.ok || busy) return;
    action(aliasCheck.alias);
  };

  const aliasSection = (
    <div className="field">
      <label htmlFor={`${id}-alias`} className="label">
        {copy.alias}
      </label>
      <input
        id={`${id}-alias`}
        type="text"
        autoComplete="nickname"
        value={alias}
        aria-invalid={aliasError !== null}
        aria-describedby={`${id}-alias-help`}
        onChange={(event) => {
          setAlias(event.target.value);
          if (event.target.value.trim().length > 0) setAliasTouched(true);
        }}
        onBlur={() => setAliasTouched(true)}
      />
      <p id={`${id}-alias-help`} className={aliasError ? "field__error" : "field__hint"}>
        {aliasError ?? copy.aliasHint}
      </p>
    </div>
  );

  const createForm = (
    <form className="panel mp-card" onSubmit={withAlias((value) => props.onCreate(value, timer))}>
      <fieldset className="mp-timer">
        <legend className="label">{copy.timer}</legend>
        {TIMER_OPTIONS.map((option) => (
          <label key={option ?? "off"} className={`chip${timer === option ? " is-active" : ""}`}>
            <input
              type="radio"
              name={`${id}-timer`}
              checked={timer === option}
              onChange={() => setTimer(option)}
            />
            {option === null ? copy.timerOff : copy.timerSeconds(option)}
          </label>
        ))}
      </fieldset>
      <button type="submit" className={invited ? "" : "primary"} disabled={busy}>
        {copy.create}
      </button>
    </form>
  );

  const joinForm = (
    <form
      className="panel mp-card"
      onSubmit={withAlias((value) => {
        if (codeReady) props.onJoin(code.value, value);
      })}
    >
      <h2 className="label">{copy.join}</h2>
      <div className="field">
        <label htmlFor={`${id}-code`} className="label">
          {copy.code}
        </label>
        <input
          id={`${id}-code`}
          type="text"
          className="code-input"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code.value}
          aria-invalid={codeError !== null}
          aria-describedby={`${id}-code-help`}
          onChange={(event) => setCode(normalizeCodeInput(event.target.value))}
        />
        <p id={`${id}-code-help`} className={codeError ? "field__error" : "field__hint"}>
          {codeError ?? copy.codeHint}
        </p>
      </div>
      <button type="submit" className={invited ? "primary" : ""} disabled={!codeReady || busy}>
        {copy.joinButton}
      </button>
    </form>
  );

  return (
    <main className="screen mp-entry">
      <header className="mp-entry__header">
        <h1 className="screen__title">{copy.title}</h1>
        <p className="dim">{invited ? copy.joinFromLink(invited) : copy.subtitle}</p>
      </header>
      {aliasSection}
      <div className="mp-entry__options">
        {invited ? (
          <>
            {joinForm}
            {createForm}
          </>
        ) : (
          <>
            {createForm}
            {joinForm}
          </>
        )}
      </div>
      <button type="button" className="ghost" onClick={props.onBack}>
        {copy.back}
      </button>
    </main>
  );
}
