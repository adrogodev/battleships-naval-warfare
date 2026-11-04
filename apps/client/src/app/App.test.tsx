import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAiGameOptions } from "../adapters/localAiGame";
import { SocketGame } from "../adapters/socketGame";
import { AudioEngine } from "../audio";
import { FakeAudioContext } from "../audio/fakeAudioContext";
import { FakeSocket, fakeView, roomState, twoPlayers } from "../multiplayer/testing/fakeSocket";
import { commanderLines } from "../narrative/commander";
import { settingsStore } from "../settings/settingsStore";
import { App, type AppProps } from "./App";

/** Records the options of every game the App creates (before the AI is built). */
const createdGames = vi.hoisted(() => [] as LocalAiGameOptions[]);
vi.mock("../adapters/localAiGame", async (importOriginal) => {
  const original = await importOriginal<typeof import("../adapters/localAiGame")>();
  class RecordingGame extends original.LocalAiGame {
    constructor(options: LocalAiGameOptions) {
      createdGames.push(options);
      super(options);
    }
  }
  return { ...original, LocalAiGame: RecordingGame };
});

beforeEach(() => {
  vi.useFakeTimers();
  settingsStore.clear();
  createdGames.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

/** jsdom has no Web Audio: the engine degrades to silent no-ops, which is what we test here. */
const silentAudio = () =>
  new AudioEngine(() => {
    throw new Error("Web Audio unavailable");
  });

async function bootToMenu(props: Partial<AppProps> = { thinkDelayMs: { min: 400, max: 900 } }) {
  render(<App seed={() => 42} audio={silentAudio()} {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Pulsa para comenzar" }));
  });
}

function chooseCommander(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

async function startBattle(props?: Partial<AppProps>) {
  await bootToMenu(props);
  chooseCommander(/Alférez Ruiz/);
  const ready = screen.getByRole("button", { name: "Flota lista" });
  expect(ready).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
  expect(ready).toBeEnabled();
  fireEvent.click(ready);
}

const radar = () => screen.getByRole("group", { name: "Radar · Flota enemiga" });
const transmission = () => screen.queryByRole("complementary", { name: "Transmisión" });
/** Cheap lookup for loops: role queries over 200 cells are too slow per timer step. */
const transmissionText = () => document.querySelector(".transmission")?.textContent ?? null;

/**
 * Fires at the first untouched radar cell, shot after shot, stepping the timers in short slices
 * (shorter than any transient overlay) until `done` holds. Returns whether it did.
 */
function playUntil(done: () => boolean): boolean {
  for (let shot = 0; shot < 100; shot++) {
    if (document.querySelector(".results__title")) return false;
    const target = document.querySelector<HTMLButtonElement>(
      '[data-board="radar"] button[aria-label$="sin disparar"]',
    );
    if (!target) return false;
    fireEvent.click(target);
    for (let step = 0; step < 100 && vi.getTimerCount() > 0; step++) {
      act(() => {
        vi.advanceTimersByTime(250);
      });
      if (done()) return true;
    }
  }
  return false;
}

/** Effects schedule new timers after each flush, so run them until none are left. */
function settle() {
  for (let round = 0; round < 50 && vi.getTimerCount() > 0; round++) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }
}

describe("App", () => {
  it("leaves the boot screen even when the browser never resumes audio", async () => {
    // Chrome keeps resume() pending without a trusted gesture or while the tab is hidden.
    const context = new FakeAudioContext();
    context.state = "suspended";
    let resumeCalls = 0;
    context.resume = () => {
      resumeCalls++;
      return new Promise<void>(() => {});
    };
    const stuck = new AudioEngine(() => context as unknown as AudioContext);
    render(<App seed={() => 42} audio={stuck} />);
    for (let attempt = 0; attempt < 2; attempt++) {
      const start = screen.queryByRole("button", { name: "Pulsa para comenzar" });
      if (!start) break;
      await act(async () => {
        fireEvent.click(start);
      });
    }
    expect(screen.getByRole("button", { name: "Jugar contra la IA" })).toBeInTheDocument();
    // A later gesture retries the resume the browser left pending (without waiting for it).
    expect(resumeCalls).toBe(1);
    void stuck.unlock();
    expect(resumeCalls).toBe(2);
  });

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
    chooseCommander(/Alférez Ruiz/);
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

  it("persists the AI delay and commander comments from the settings screen", async () => {
    await bootToMenu();
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Velocidad de la IA/ }), {
      target: { value: "fast" },
    });
    expect(settingsStore.get().aiDelay).toBe("fast");
    fireEvent.click(screen.getByRole("checkbox", { name: /Comentarios del comandante/ }));
    expect(settingsStore.get().commanderComments).toBe(false);
  });
});

describe("App · multiplayer", () => {
  function fakeMultiplayer() {
    const sockets: FakeSocket[] = [];
    const createMultiplayerGame = () =>
      new SocketGame({
        url: "http://server.test",
        socketFactory: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
        storage: sessionStorage,
      });
    const socket = () => {
      const last = sockets.at(-1);
      if (!last) throw new Error("no socket");
      return last;
    };
    return { createMultiplayerGame, socket };
  }

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  it("opens the multiplayer entry from the menu and goes back", async () => {
    const mp = fakeMultiplayer();
    await bootToMenu({ createMultiplayerGame: mp.createMultiplayerGame });
    fireEvent.click(screen.getByRole("button", { name: "Multijugador" }));
    expect(screen.getByRole("heading", { name: "Estableciendo enlace" })).toBeInTheDocument();
    act(() => mp.socket().serverConnect());
    expect(screen.getByRole("heading", { name: "Multijugador" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al menú" }));
    expect(screen.getByRole("button", { name: "Jugar contra la IA" })).toBeInTheDocument();
    expect(mp.socket().disconnectCalls).toBeGreaterThan(0);
  });

  it("goes straight to the join flow when opened with an invitation link", async () => {
    window.history.replaceState(null, "", "/?sala=abc234");
    const mp = fakeMultiplayer();
    await bootToMenu({ createMultiplayerGame: mp.createMultiplayerGame });
    act(() => mp.socket().serverConnect());
    expect(screen.getByText("Te han invitado a la sala ABC234")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Código de sala" })).toHaveValue("ABC234");
  });

  it("plays the online flow: create, wait, deploy and battle against a human", async () => {
    const mp = fakeMultiplayer();
    await bootToMenu({ createMultiplayerGame: mp.createMultiplayerGame });
    fireEvent.click(screen.getByRole("button", { name: "Multijugador" }));
    const socket = mp.socket();
    act(() => socket.serverConnect());
    fireEvent.change(screen.getByRole("textbox", { name: "Tu alias de comandante" }), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala privada" }));
    await act(async () => {
      socket.reply("room:create", { ok: true, code: "ABC234", token: "t".repeat(20), seat: 0 });
      socket.serverEmit("room:state", roomState({ players: twoPlayers() }));
    });
    expect(screen.getByRole("heading", { name: "Sala de espera" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(socket.last("room:ready").payload).toHaveProperty("actionId");

    act(() =>
      socket.serverEmit(
        "room:state",
        roomState({ players: twoPlayers({ ready: true }), view: fakeView({ phase: "placement" }) }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Flota lista" }));
    expect(socket.last("fleet:submit").payload.fleet).toHaveLength(5);

    act(() =>
      socket.serverEmit(
        "room:state",
        roomState({
          players: twoPlayers({ ready: true }),
          view: fakeView({ phase: "battle", turn: 0 }),
          turnDeadline: Date.now() + 30_000,
        }),
      ),
    );
    expect(screen.getByText("vs Bruno")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tu turno" })).toHaveTextContent("30 s");
    expect(transmission()).toBeNull();
    const [first] = within(radar()).getAllByRole("button");
    if (!first) throw new Error("radar has no cells");
    fireEvent.click(first);
    expect(socket.last("shot:fire").payload.coord).toEqual({ col: 0, row: 0 });
    await act(async () => {
      socket.reply("shot:fire", { ok: false, error: "NOT_YOUR_TURN" });
    });
    expect(screen.getByText("No es tu turno.")).toBeInTheDocument();
  });
});

describe("App · difficulty and commanders", () => {
  it("goes menu → difficulty → deploy and shows the chosen commander in battle", async () => {
    await bootToMenu();
    fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
    expect(screen.getByRole("heading", { name: "Elige a tu rival" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alférez Ruiz/ }));
    expect(screen.getByRole("heading", { name: "Despliegue de flota" })).toBeInTheDocument();
    expect(createdGames.at(-1)?.difficulty).toBe("easy");

    fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Flota lista" }));
    expect(screen.getByText("vs Alférez Ruiz")).toBeInTheDocument();
  });

  it("no longer claims a fixed rival on the menu and shows the remembered one", async () => {
    settingsStore.update({ lastDifficulty: "hard" });
    await bootToMenu();
    expect(screen.queryByText(/Dificultad fácil/)).not.toBeInTheDocument();
    expect(screen.getByText(/Almirante Castellanos/)).toBeInTheDocument();
  });

  it("remembers the chosen difficulty", async () => {
    settingsStore.update({ lastDifficulty: "normal" });
    await bootToMenu();
    fireEvent.click(screen.getByRole("button", { name: "Jugar contra la IA" }));
    const normal = screen.getByRole("button", { name: /Capitán Varela/ });
    expect(normal).toHaveFocus();
    expect(within(normal).getByText("Última usada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alférez Ruiz/ }));
    expect(settingsStore.get().lastDifficulty).toBe("easy");
  });

  // Needs the Normal/Hard AI (unit A): createAi("hard") throws until it lands.
  it("starts a game against the chosen hard commander and remembers it", async () => {
    await bootToMenu();
    chooseCommander(/Almirante Castellanos/);
    expect(settingsStore.get().lastDifficulty).toBe("hard");
    expect(createdGames.at(-1)?.difficulty).toBe("hard");
    expect(screen.getByRole("heading", { name: "Despliegue de flota" })).toBeInTheDocument();
  });

  // Needs the Normal/Hard AI (unit A): createAi("normal") throws until it lands.
  it("replays the same difficulty with “Jugar otra vez”", async () => {
    await bootToMenu();
    chooseCommander(/Capitán Varela/);
    fireEvent.click(screen.getByRole("button", { name: "Despliegue aleatorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Flota lista" }));
    expect(screen.getByText("vs Capitán Varela")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abandonar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, abandonar" }));
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Jugar otra vez" }));
    expect(createdGames.map((options) => options.difficulty)).toEqual(["normal", "normal"]);
  });

  it("takes the AI think delay from the settings unless the prop overrides it", async () => {
    settingsStore.update({ aiDelay: "fast" });
    await bootToMenu({});
    chooseCommander(/Alférez Ruiz/);
    expect(createdGames.at(-1)?.thinkDelayMs).toEqual({ min: 150, max: 300 });
  });

  it("uses the normal 400–900 ms think delay by default", async () => {
    await bootToMenu({});
    chooseCommander(/Alférez Ruiz/);
    expect(createdGames.at(-1)?.thinkDelayMs).toEqual({ min: 400, max: 900 });
  });

  it("keeps the thinkDelayMs prop over the AI delay setting", async () => {
    settingsStore.update({ aiDelay: "fast" });
    await bootToMenu({ thinkDelayMs: { min: 1, max: 2 } });
    chooseCommander(/Alférez Ruiz/);
    expect(createdGames.at(-1)?.thinkDelayMs).toEqual({ min: 1, max: 2 });
  });

  it("shows a commander transmission at battle start and when a ship is sunk", async () => {
    await startBattle();
    const start = transmission();
    expect(start).not.toBeNull();
    expect(start).toHaveTextContent("Alférez Ruiz");
    const startLines = commanderLines("easy", "battleStart");
    expect(startLines.some((line) => start?.textContent?.includes(line))).toBe(true);
    expect(start?.parentElement).toHaveAttribute("aria-live", "polite");

    const sinkLines = (["playerSinks", "aiSinks", "aiLastShip", "playerLastShip"] as const).flatMap(
      (moment) => commanderLines("easy", moment),
    );
    const sawSinkComment = () =>
      sinkLines.some((line) => transmissionText()?.includes(line) ?? false);

    expect(playUntil(sawSinkComment)).toBe(true);
  }, 60_000);

  it("shows no commander transmission when comments are off", async () => {
    settingsStore.update({ commanderComments: false });
    await startBattle();
    expect(transmission()).toBeNull();
    // The sinking banner and a commander comment come from the same sequence phase.
    const sunkBanner = () => {
      expect(transmissionText()).toBeNull();
      return document.querySelector(".banner") !== null;
    };
    expect(playUntil(sunkBanner)).toBe(true);
  }, 60_000);
});
