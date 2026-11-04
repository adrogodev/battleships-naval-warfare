import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DifficultyScreen } from "./DifficultyScreen";

describe("DifficultyScreen", () => {
  it("shows the three commanders with name and a one-line description", () => {
    render(<DifficultyScreen lastDifficulty="easy" onSelect={() => {}} onBack={() => {}} />);
    const cards = screen.getAllByRole("button", { name: /Alférez|Capitán|Almirante/ });
    expect(cards).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Alférez Ruiz/ })).toHaveTextContent(
      "Dispara a ciegas y no persigue sus impactos.",
    );
    expect(screen.getByRole("button", { name: /Capitán Varela/ })).toHaveTextContent(
      "Barre en damero y remata cada impacto que consigue.",
    );
    expect(screen.getByRole("button", { name: /Almirante Castellanos/ })).toHaveTextContent(
      "Calcula dónde es más probable que estés. No perdona.",
    );
  });

  it("marks and focuses the last used commander", () => {
    render(<DifficultyScreen lastDifficulty="hard" onSelect={() => {}} onBack={() => {}} />);
    const hard = screen.getByRole("button", { name: /Almirante Castellanos/ });
    expect(within(hard).getByText("Última usada")).toBeInTheDocument();
    expect(hard).toHaveFocus();
    expect(screen.getAllByText("Última usada")).toHaveLength(1);
  });

  it("calls back with the chosen difficulty", () => {
    const onSelect = vi.fn();
    render(<DifficultyScreen lastDifficulty="easy" onSelect={onSelect} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Capitán Varela/ }));
    expect(onSelect).toHaveBeenCalledWith("normal");
  });

  it("goes back to the menu", () => {
    const onBack = vi.fn();
    render(<DifficultyScreen lastDifficulty="easy" onSelect={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
