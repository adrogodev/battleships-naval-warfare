import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REDUCED_MOTION } from "../theme/motion";
import { TutorialScreen } from "./TutorialScreen";

function setup() {
  const onExit = vi.fn();
  const play = vi.fn();
  render(
    <TutorialScreen motion={REDUCED_MOTION} reducedMotion={true} play={play} onExit={onExit} />,
  );
  return { onExit, play };
}

const live = () => screen.getByRole("status");
const radar = () => screen.getByRole("group", { name: "Radar enemigo de práctica" });
const deck = () => screen.getByRole("group", { name: "Tu tablero de práctica" });

function placeAndContinue() {
  fireEvent.click(within(deck()).getByRole("button", { name: "B-2, agua" }));
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}

describe("TutorialScreen", () => {
  it("completes step 1 only after a valid placement", () => {
    const { play } = setup();
    expect(screen.getByRole("heading", { name: "Coloca tu destructor" })).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Siguiente" });
    expect(next).toBeDisabled();

    // F-1 horizontal would leave the board.
    fireEvent.click(within(deck()).getByRole("button", { name: "F-1, agua" }));
    expect(live()).toHaveTextContent("No cabe ahí: se sale del tablero.");
    expect(next).toBeDisabled();

    fireEvent.click(within(deck()).getByRole("button", { name: "B-2, agua" }));
    expect(live()).toHaveTextContent("Destructor colocado en B-2, horizontal.");
    expect(within(deck()).getByRole("button", { name: "C-2, destructor" })).toBeInTheDocument();
    expect(play).toHaveBeenCalledWith("place");
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "Dispara al radar enemigo" })).toBeInTheDocument();
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
  });

  it("rotates the ship with the R key and the rotate button", () => {
    setup();
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByRole("button", { name: /Girar · vertical/ })).toBeInTheDocument();
    fireEvent.click(within(deck()).getByRole("button", { name: "A-1, agua" }));
    expect(live()).toHaveTextContent("Destructor colocado en A-1, vertical.");
    expect(within(deck()).getByRole("button", { name: "A-2, destructor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Girar/ }));
    expect(screen.getByRole("button", { name: /Girar · horizontal/ })).toBeInTheDocument();
  });

  it("reports a miss and a hit in the live region, then sinks the ship and finishes", async () => {
    const { play, onExit } = setup();
    placeAndContinue();

    fireEvent.click(within(radar()).getByRole("button", { name: "A-1, sin disparar" }));
    expect(play).toHaveBeenCalledWith("fire");
    expect(await screen.findByText("A-1, agua. Fallaste.")).toBeInTheDocument();
    expect(live()).toHaveTextContent("A-1, agua. Fallaste.");
    expect(play).toHaveBeenCalledWith("miss");
    expect(within(radar()).getByRole("button", { name: "A-1, agua" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hunde el destructor" })).toBeInTheDocument();
    expect(screen.getByText("Pista: prueba en D-3.")).toBeInTheDocument();

    // Firing twice at the same cell is rejected without a shot.
    fireEvent.click(within(radar()).getByRole("button", { name: "A-1, agua" }));
    expect(live()).toHaveTextContent("Ya disparaste a A-1. Elige otra casilla.");

    fireEvent.click(within(radar()).getByRole("button", { name: "D-3, sin disparar" }));
    expect(await screen.findByText("D-3, impacto. ¡Le diste!")).toBeInTheDocument();
    expect(play).toHaveBeenCalledWith("hit");
    expect(within(radar()).getByRole("button", { name: "D-3, impacto" })).toBeInTheDocument();

    fireEvent.click(within(radar()).getByRole("button", { name: "E-3, sin disparar" }));
    expect(
      await screen.findByRole("heading", { name: "¡Listo para el combate!" }),
    ).toBeInTheDocument();
    expect(live()).toHaveTextContent("E-3, hundido. ¡Destructor enemigo hundido!");
    expect(play).toHaveBeenCalledWith("sunk");
    expect(within(radar()).getByRole("img", { name: "D-3, hundido" })).toBeInTheDocument();
    expect(within(radar()).getByRole("img", { name: "E-3, hundido" })).toBeInTheDocument();
    expect(document.querySelector(".tutorial .ship--sunk")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Volver al menú" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("can be completed with the keyboard only (arrows and Enter)", async () => {
    const user = userEvent.setup();
    const { onExit } = setup();

    await user.tab(); // first deck cell
    // Focus shows the placement preview, so the state part of the name is the ghost.
    expect(within(deck()).getByRole("button", { name: /^A-1, / })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(live()).toHaveTextContent("Destructor colocado en B-2, horizontal.");
    await user.tab(); // rotate
    await user.tab(); // next
    expect(screen.getByRole("button", { name: "Siguiente" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("heading", { name: "Dispara al radar enemigo" })).toHaveFocus();
    await user.tab();
    expect(within(radar()).getByRole("button", { name: "A-1, sin disparar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByText("A-1, agua. Fallaste.");

    // The hint points at D-3: three columns right, two rows down.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}");
    expect(within(radar()).getByRole("button", { name: "D-3, sin disparar" })).toHaveFocus();
    await user.keyboard(" ");
    await screen.findByText("D-3, impacto. ¡Le diste!");
    await user.keyboard("{ArrowRight}{Enter}");

    const done = await screen.findByRole("heading", { name: "¡Listo para el combate!" });
    expect(done).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Volver al menú" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("skips the tutorial from any step", () => {
    const { onExit } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Saltar tutorial" }));
    expect(onExit).toHaveBeenCalledOnce();
    placeAndContinue();
    fireEvent.click(screen.getByRole("button", { name: "Saltar tutorial" }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("marks the current step in the progress indicator", () => {
    setup();
    const progress = screen.getByRole("list", { name: "Progreso del tutorial" });
    const items = within(progress).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(items[1]).not.toHaveAttribute("aria-current");
  });
});
