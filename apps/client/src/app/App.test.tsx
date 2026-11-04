import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio";
import { settingsStore } from "../settings/settingsStore";
import { App } from "./App";

beforeEach(() => {
  vi.useFakeTimers();
  settingsStore.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

/** jsdom has no Web Audio: the engine degrades to silent no-ops, which is what we test here. */
const silentAudio = () =>
  new AudioEngine(() => {
    throw new Error("Web Audio unavailable");
  });

async function bootToMenu() {
  render(<App seed={() => 42} thinkDelayMs={{ min: 400, max: 900 }} audio={silentAudio()} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Pulsa para comenzar" }));
  });
}

async function startBattle() {
  await bootToMenu();
  fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
  const ready = screen.getByRole("button", { name: "Flota lista" });
  expect(ready).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
  expect(ready).toBeEnabled();
  fireEvent.click(ready);
}

const radar = () => screen.getByRole("group", { name: "Radar · Flota enemiga" });

/** Effects schedule new timers after each flush, so run them until none are left. */
function settle() {
  for (let round = 0; round < 50 && vi.getTimerCount() > 0; round++) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }
}

describe("App", () => {
  it("plays a full game against the easy AI through the UI", async () => {
    await startBattle();
    expect(screen.getByRole("status")).toHaveTextContent("Tu turno");
    expect(screen.getByText(/^Operación \S+ \S+$/)).toBeInTheDocument();

    for (let shot = 0; shot < 100; shot++) {
      if (document.querySelector(".results__title")) break;
      // Plain selector: role queries over 200 cells are too slow for a 100-shot loop.
      const target = radar().querySelector<HTMLButtonElement>('button[aria-label$="sin disparar"]');
      if (!target) break;
      fireEvent.click(target);
      settle();
    }

    expect(screen.getByRole("heading", { name: /Victoria|Derrota/ })).toBeInTheDocument();
    expect(screen.getByText("Precisión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jugar otra vez" })).toBeEnabled();
  }, 60_000);

  it("plays the shot sequence before revealing the result and blocks input meanwhile", async () => {
    await startBattle();
    const [first, second] = within(radar()).getAllByRole("button");
    if (!first || !second) throw new Error("radar has no cells");

    fireEvent.click(first);
    expect(screen.getByRole("status")).toHaveTextContent("Disparo en curso");
    // Suspense: the result is not visible yet.
    expect(first).toHaveAccessibleName("A-1, sin disparar");
    expect(second).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("[Cañonazo]")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(first).toHaveAccessibleName(/^A-1, (agua|impacto)$/);

    settle();
    expect(screen.getByRole("status")).toHaveTextContent("Tu turno");
    expect(screen.getAllByText(/A-1/).length).toBeGreaterThan(0);
  });

  it("asks for a second tap before firing when shot confirmation is on", async () => {
    settingsStore.update({ confirmShot: "always" });
    await startBattle();
    const [first] = within(radar()).getAllByRole("button");
    if (!first) throw new Error("radar has no cells");
    fireEvent.click(first);
    expect(screen.getByRole("status")).toHaveTextContent("Toca de nuevo para disparar");
    expect(screen.getByText("A-1", { selector: ".cell__tag" })).toBeInTheDocument();
    fireEvent.click(first);
    expect(screen.getByRole("status")).toHaveTextContent("Disparo en curso");
  });

  it("explains why a manual placement is invalid", async () => {
    await bootToMenu();
    fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
    const board = screen.getByRole("group", { name: "Tablero de despliegue" });
    fireEvent.click(within(board).getByRole("button", { name: "A-1, agua" }));
    fireEvent.mouseEnter(within(board).getByRole("button", { name: "A-2, agua" }));
    expect(screen.getByText("Toca otro barco")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByRole("button", { name: /Girar \(R\) · vertical/ })).toBeInTheDocument();
  });

  it("persists audio settings changed from the settings screen", async () => {
    await bootToMenu();
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Silencio general" }));
    expect(settingsStore.get().mix.muted).toBe(true);
    fireEvent.change(screen.getByRole("slider", { name: /Música/ }), { target: { value: "20" } });
    expect(settingsStore.get().mix.music).toBeCloseTo(0.2);
  });
});
