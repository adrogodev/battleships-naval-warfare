import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CHALLENGES } from "../progress/challenges";
import { applyGame, EMPTY_PROGRESS, type PlayerProgress } from "../progress/progress";
import { gameRecord } from "../progress/testing";
import { StatsScreen } from "./StatsScreen";

function played(): PlayerProgress {
  let progress = EMPTY_PROGRESS;
  const base = gameRecord().stats;
  const games = [
    gameRecord({
      id: "a",
      difficulty: "hard",
      won: true,
      stats: { ...base, shots: 44, accuracy: 0.4, maxStreak: 5 },
      ownShots: [
        { col: 2, row: 6 },
        { col: 2, row: 6 },
      ],
      enemyShipsSunk: ["carrier", "destroyer"],
    }),
    gameRecord({
      id: "b",
      mode: "online",
      difficulty: null,
      won: false,
      stats: { ...base, shots: 60, accuracy: 0.2 },
      enemyShipsSunk: [],
    }),
  ];
  for (const game of games) progress = applyGame(progress, game).progress;
  return progress;
}

describe("StatsScreen", () => {
  it("shows rank, games, wins, average accuracy, best streak and shortest win", () => {
    render(<StatsScreen progress={played()} onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: "Estadísticas", level: 1 })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Resumen" });
    expect(within(summary).getByText("Partidas").nextSibling).toHaveTextContent("2");
    expect(within(summary).getByText("Victorias").nextSibling).toHaveTextContent("1");
    expect(within(summary).getByText("Precisión media").nextSibling).toHaveTextContent("30%");
    expect(within(summary).getByText("Mejor racha").nextSibling).toHaveTextContent("5");
    expect(within(summary).getByText("Partida más corta").nextSibling).toHaveTextContent(
      "44 disparos",
    );
    expect(screen.getByRole("region", { name: "Rango de comandante" })).toHaveTextContent(
      /Marinero|Cabo|Suboficial/,
    );
  });

  it("breaks down wins by mode and difficulty", () => {
    render(<StatsScreen progress={played()} onBack={() => {}} />);
    const table = screen.getByRole("table", { name: "Victorias por modo y dificultad" });
    const row = (name: RegExp) => within(table).getByRole("row", { name });
    expect(row(/Difícil/)).toHaveTextContent(/1\s*1/);
    expect(row(/Multijugador/)).toHaveTextContent(/1\s*0/);
    expect(row(/Fácil/)).toHaveTextContent(/0\s*0/);
  });

  it("renders the shot heatmap as an accessible table", () => {
    render(<StatsScreen progress={played()} onBack={() => {}} />);
    const heatmap = screen.getByRole("table", { name: "Mapa de calor de tus disparos" });
    expect(within(heatmap).getAllByRole("columnheader")).toHaveLength(10);
    expect(within(heatmap).getAllByRole("rowheader")).toHaveLength(10);
    expect(within(heatmap).getByRole("cell", { name: "C-7: 2 disparos" })).toBeInTheDocument();
    expect(within(heatmap).getByRole("cell", { name: "A-1: 0 disparos" })).toBeInTheDocument();
  });

  it("lists every challenge with its badge state", () => {
    render(<StatsScreen progress={played()} onBack={() => {}} />);
    const list = screen.getByRole("list", { name: "Desafíos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(CHALLENGES.length);
    const hard = within(list).getByText("Gana en Difícil con menos de 45 disparos").closest("li");
    expect(hard).toHaveTextContent("Completado");
    const flawless = within(list).getByText("Gana sin perder ningún barco").closest("li");
    expect(flawless).toHaveTextContent("Pendiente");
  });

  it("invites to play when there are no games yet, and goes back", () => {
    const onBack = vi.fn();
    render(<StatsScreen progress={EMPTY_PROGRESS} onBack={onBack} />);
    expect(screen.getByText(/Aún no has jugado ninguna partida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onBack).toHaveBeenCalled();
  });
});
