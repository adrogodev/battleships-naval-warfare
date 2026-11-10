import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettings } from "../app/useEnvironment";
import { EMPTY_PROGRESS } from "../progress/progress";
import { progressStore } from "../progress/progressStore";
import { gameRecord } from "../progress/testing";
import { DEFAULT_SETTINGS, settingsStore } from "../settings/settingsStore";
import { SettingsScreen } from "./SettingsScreen";

function Harness() {
  return <SettingsScreen settings={useSettings()} onBack={() => {}} />;
}

beforeEach(() => {
  settingsStore.clear();
  progressStore.clear();
  localStorage.clear();
});

describe("SettingsScreen · data", () => {
  it("resets only the settings with “Restablecer ajustes” (previous behavior)", () => {
    settingsStore.update({ vibration: false });
    progressStore.recordGame(gameRecord());
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Restablecer ajustes" }));
    expect(settingsStore.get()).toEqual(DEFAULT_SETTINGS);
    expect(progressStore.get().games).toBe(1);
  });

  it("asks for confirmation before deleting data and can be cancelled", () => {
    progressStore.recordGame(gameRecord());
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar datos" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("¿Borrar todos los datos?");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(progressStore.get().games).toBe(1);
  });

  it("deletes settings, progress and saved keys once confirmed", () => {
    settingsStore.update({ vibration: false, motion: "reduced" });
    progressStore.recordGame(gameRecord());
    localStorage.setItem("battleships.tutorial", "done");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Borrar datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, borrar todo" }));
    expect(settingsStore.get()).toEqual(DEFAULT_SETTINGS);
    expect(progressStore.get()).toEqual(EMPTY_PROGRESS);
    expect(localStorage.getItem("battleships.progress")).toBeNull();
    expect(localStorage.getItem("battleships.settings")).toBeNull();
    expect(localStorage.getItem("battleships.tutorial")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Datos borrados.");
    // The form reflects the reset at once.
    expect(screen.getByRole("combobox", { name: /^Movimiento/ })).toHaveValue("system");
  });
});
