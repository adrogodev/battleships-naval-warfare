import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function startBattle() {
  render(<App seed={() => 42} thinkDelayMs={{ min: 400, max: 900 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
  const ready = screen.getByRole("button", { name: "Flota lista" });
  expect(ready).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
  expect(ready).toBeEnabled();
  fireEvent.click(ready);
}

describe("App", () => {
  it("plays a full game against the easy AI through the UI", () => {
    startBattle();
    expect(screen.getByRole("status")).toHaveTextContent("Tu turno");
    const radar = () => screen.getByRole("group", { name: "Radar · Flota enemiga" });

    for (let shot = 0; shot < 100; shot++) {
      if (screen.queryByRole("heading", { name: /Victoria|Derrota/ })) break;
      // Plain selector: role queries over 200 cells are too slow for a 100-shot loop.
      const target = radar().querySelector<HTMLButtonElement>('button[aria-label$="sin disparar"]');
      if (!target) break;
      fireEvent.click(target);
      act(() => {
        vi.runAllTimers();
      });
    }

    expect(screen.getByRole("heading", { name: /Victoria|Derrota/ })).toBeInTheDocument();
    expect(screen.getByText("Precisión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jugar otra vez" })).toBeEnabled();
  }, 30_000);

  it("blocks firing while the enemy is thinking and announces the result", () => {
    startBattle();
    const radar = screen.getByRole("group", { name: "Radar · Flota enemiga" });
    const [first, second] = within(radar).getAllByRole("button");
    if (!first || !second) throw new Error("radar has no cells");

    fireEvent.click(first);
    expect(screen.getByRole("status")).toHaveTextContent("El enemigo calcula su disparo");
    expect(first).toHaveAccessibleName(/^A-1, (agua|impacto|hundido)$/);
    expect(second).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(second);
    expect(second).toHaveAccessibleName("B-1, sin disparar");

    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Tu turno");
    expect(screen.getByText(/en A-1\.$/)).toBeInTheDocument();
  });

  it("explains why a manual placement is invalid", () => {
    render(<App seed={() => 1} />);
    fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
    const board = screen.getByRole("group", { name: "Tablero de despliegue" });
    fireEvent.click(within(board).getByRole("button", { name: "A-1, agua" }));
    fireEvent.mouseEnter(within(board).getByRole("button", { name: "A-2, agua" }));
    expect(screen.getByText("Toca otro barco")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByRole("button", { name: /Girar \(R\) · vertical/ })).toBeInTheDocument();
  });
});
