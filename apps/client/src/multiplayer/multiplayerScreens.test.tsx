import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerSnapshot } from "../adapters/socketGame";
import { LiveMatch } from "./LiveMatch";
import { MultiplayerEntry } from "./MultiplayerEntry";
import { RematchPanel } from "./RematchPanel";
import { normalizeCodeInput } from "./roomCode";
import { type StatusKind, StatusScreen, statusKindFor } from "./StatusScreen";
import { fakeView, player, roomState, twoPlayers } from "./testing/fakeSocket";
import { WaitingRoom } from "./WaitingRoom";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const entry = (props: Partial<Parameters<typeof MultiplayerEntry>[0]> = {}) => {
  const onCreate = vi.fn();
  const onJoin = vi.fn();
  render(
    <MultiplayerEntry
      pending={null}
      onCreate={onCreate}
      onJoin={onJoin}
      onBack={() => {}}
      {...props}
    />,
  );
  return { onCreate, onJoin };
};

describe("MultiplayerEntry", () => {
  it("validates the alias with clear messages", () => {
    const { onCreate } = entry();
    const alias = screen.getByRole("textbox", { name: "Tu alias de comandante" });
    fireEvent.change(alias, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala privada" }));
    expect(screen.getByText("El alias necesita al menos 2 caracteres.")).toBeInTheDocument();
    fireEvent.change(alias, { target: { value: "Comandante<script>" } });
    expect(screen.getByText("El alias admite como máximo 16 caracteres.")).toBeInTheDocument();
    fireEvent.change(alias, { target: { value: "Ana!" } });
    expect(
      screen.getByText("Usa solo letras, números, espacios, guion o guion bajo."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates a room with the chosen turn timer", () => {
    const { onCreate } = entry();
    fireEvent.change(screen.getByRole("textbox", { name: "Tu alias de comandante" }), {
      target: { value: "  Ana   María " },
    });
    fireEvent.click(screen.getByRole("radio", { name: "30 s" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear sala privada" }));
    expect(onCreate).toHaveBeenCalledWith("Ana María", 30);
  });

  it("creates a room without timer by default", () => {
    const { onCreate } = entry();
    fireEvent.change(screen.getByRole("textbox", { name: "Tu alias de comandante" }), {
      target: { value: "Ana" },
    });
    expect(screen.getByRole("radio", { name: "Sin límite" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Crear sala privada" }));
    expect(onCreate).toHaveBeenCalledWith("Ana", null);
  });

  it("normalises the code to upper case and rejects ambiguous characters", () => {
    const { onJoin } = entry();
    fireEvent.change(screen.getByRole("textbox", { name: "Tu alias de comandante" }), {
      target: { value: "Bruno" },
    });
    const code = screen.getByRole("textbox", { name: "Código de sala" });
    const join = screen.getByRole("button", { name: "Unirse" });
    fireEvent.change(code, { target: { value: "ab0" } });
    expect(code).toHaveValue("AB0");
    expect(
      screen.getByText("Ese carácter no existe en los códigos: no usan O, 0, I ni 1."),
    ).toBeInTheDocument();
    expect(join).toBeDisabled();
    fireEvent.change(code, { target: { value: "abc 234" } });
    expect(code).toHaveValue("ABC234");
    expect(join).toBeEnabled();
    fireEvent.click(join);
    expect(onJoin).toHaveBeenCalledWith("ABC234", "Bruno");
  });

  it("prefills the code from the invitation link", () => {
    entry({ initialCode: "abc234" });
    expect(screen.getByText("Te han invitado a la sala ABC234")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Código de sala" })).toHaveValue("ABC234");
  });
});

describe("normalizeCodeInput", () => {
  it("upper-cases, drops spaces and flags characters outside the alphabet", () => {
    expect(normalizeCodeInput(" xy z2 ")).toEqual({ value: "XYZ2", ambiguous: false });
    expect(normalizeCodeInput("ai1o")).toEqual({ value: "AI1O", ambiguous: true });
    expect(normalizeCodeInput("abcdefgh").value).toBe("ABCDEF");
  });
});

describe("WaitingRoom", () => {
  const waiting = (overrides: Partial<Parameters<typeof WaitingRoom>[0]> = {}) => {
    const onReady = vi.fn();
    render(
      <WaitingRoom
        room={roomState({ players: twoPlayers({ connected: false }), turnTimerSec: 30 })}
        shareUrl="https://juego.test/?sala=ABC234"
        onReady={onReady}
        onLeave={() => {}}
        {...overrides}
      />,
    );
    return { onReady };
  };

  it("shows the code big, both players with connection and ready state", () => {
    const room = roomState({
      players: [player(0, { ready: true }), player(1, { connected: false })],
    });
    waiting({ room });
    expect(screen.getByText("ABC234")).toHaveClass("room-code");
    const ana = screen.getByRole("listitem", { name: /Ana/ });
    expect(ana).toHaveTextContent("tú");
    expect(ana).toHaveTextContent("Conectado");
    expect(ana).toHaveTextContent("Listo");
    const bruno = screen.getByRole("listitem", { name: /Bruno/ });
    expect(bruno).toHaveTextContent("Desconectado");
    expect(bruno).toHaveTextContent("Preparándose");
  });

  it("shows an empty seat until the rival joins", () => {
    waiting({ room: roomState() });
    expect(screen.getByText("Esperando a un rival…")).toBeInTheDocument();
  });

  it("copies the code with one click and confirms it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    waiting();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
    });
    expect(writeText).toHaveBeenCalledWith("ABC234");
    expect(screen.getByRole("status")).toHaveTextContent("Código copiado");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar enlace de invitación" }));
    });
    expect(writeText).toHaveBeenLastCalledWith("https://juego.test/?sala=ABC234");
    expect(screen.getByRole("status")).toHaveTextContent("Enlace copiado");
  });

  it("sends ready once and then waits for the rival", () => {
    const { onReady } = waiting();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("hides the ready button once the player is ready", () => {
    const room = roomState({
      players: [player(0, { ready: true }), player(1)],
    });
    waiting({ room });
    expect(screen.queryByRole("button", { name: "Listo" })).not.toBeInTheDocument();
    expect(screen.getByText("Esperando al rival…")).toBeInTheDocument();
  });
});

describe("LiveMatch", () => {
  const battleRoom = (overrides: Parameters<typeof roomState>[0] = {}) =>
    roomState({
      players: twoPlayers({ ready: true }),
      view: fakeView({ phase: "battle", turn: 0 }),
      ...overrides,
    });

  const live = (overrides: Partial<Parameters<typeof LiveMatch>[0]> = {}) => {
    const onReact = vi.fn();
    const onClaimVictory = vi.fn();
    const utils = render(
      <LiveMatch
        room={battleRoom()}
        reactions={[]}
        onReact={onReact}
        onClaimVictory={onClaimVictory}
        {...overrides}
      />,
    );
    return { onReact, onClaimVictory, ...utils };
  };

  it("shows a very visible turn indicator and the turn countdown", () => {
    const { rerender } = live({ room: battleRoom({ turnDeadline: 130_000 }) });
    const turn = screen.getByRole("status", { name: "Tu turno" });
    expect(turn).toHaveTextContent("30 s");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(turn).toHaveTextContent("25 s");
    rerender(
      <LiveMatch
        room={battleRoom({ view: fakeView({ phase: "battle", turn: 1 }) })}
        reactions={[]}
        onReact={() => {}}
        onClaimVictory={() => {}}
      />,
    );
    expect(screen.getByRole("status", { name: "Turno de Bruno" })).toBeInTheDocument();
    expect(screen.queryByText(/\d+ s$/)).not.toBeInTheDocument();
  });

  it("shows the disconnection banner with a countdown while the rival is away", () => {
    live({ room: battleRoom({ reconnect: { seat: 1, deadline: 160_000 } }) });
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Comandante Bruno ha perdido la conexión");
    expect(banner).toHaveTextContent("60 s");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(banner).toHaveTextContent("50 s");
    expect(screen.queryByRole("button", { name: "Reclamar la victoria" })).not.toBeInTheDocument();
  });

  it("offers to claim the victory or keep waiting once the window expires", () => {
    const { onClaimVictory } = live({
      room: battleRoom({ reconnect: { seat: 1, deadline: 90_000 }, canClaimVictory: true }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Reclamar la victoria" }));
    expect(onClaimVictory).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Seguir esperando" }));
    expect(screen.queryByRole("button", { name: "Reclamar la victoria" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Comandante Bruno ha perdido la conexión");
  });

  it("sends quick reactions and shows received ones briefly", () => {
    const { onReact, rerender } = live();
    fireEvent.click(screen.getByRole("button", { name: "¡Buen tiro!" }));
    expect(onReact).toHaveBeenCalledWith("good_shot");
    rerender(
      <LiveMatch
        room={battleRoom()}
        reactions={[{ id: 1, seat: 1, reaction: "close", mine: false }]}
        onReact={onReact}
        onClaimVictory={() => {}}
      />,
    );
    expect(screen.getByText("Bruno:")).toBeInTheDocument();
    expect(screen.getByText("Casi", { selector: ".reaction-bubble__text" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.queryByText("Bruno:")).not.toBeInTheDocument();
  });
});

describe("RematchPanel", () => {
  const finished = (rematch: [boolean, boolean], connected = true) =>
    roomState({
      players: [
        player(0, { rematchRequested: rematch[0] }),
        player(1, { connected, rematchRequested: rematch[1] }),
      ],
      view: fakeView({ phase: "finished", winner: 0 }),
      endReason: "fleet_destroyed",
    });

  it("asks for a rematch", () => {
    const onRematch = vi.fn();
    render(
      <RematchPanel room={finished([false, false])} onRematch={onRematch} rivalGone={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pedir revancha" }));
    expect(onRematch).toHaveBeenCalledOnce();
  });

  it("shows the rival's request", () => {
    render(<RematchPanel room={finished([false, true])} onRematch={() => {}} rivalGone={false} />);
    expect(screen.getByText("Bruno quiere la revancha")).toBeInTheDocument();
  });

  it("waits for the rival after requesting", () => {
    render(<RematchPanel room={finished([true, false])} onRematch={() => {}} rivalGone={false} />);
    expect(screen.getByRole("button", { name: "Revancha solicitada" })).toBeDisabled();
    expect(screen.getByText("Esperando la respuesta de Bruno…")).toBeInTheDocument();
  });

  it("explains that the rival is gone", () => {
    render(<RematchPanel room={finished([true, false])} onRematch={() => {}} rivalGone />);
    expect(
      screen.getByText("Tu rival ha abandonado la sala. No es posible la revancha."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revancha/i })).not.toBeInTheDocument();
  });
});

describe("StatusScreen", () => {
  const cases: [StatusKind, string, boolean][] = [
    ["loading", "Estableciendo enlace", false],
    ["network", "Señal perdida", true],
    ["offline", "Sin conexión", true],
    ["notFound", "Sala inexistente", true],
    ["full", "Sala completa", true],
    ["unavailable", "Servidor no disponible", true],
    ["replaced", "Partida abierta en otra pestaña", false],
    ["closed", "Sala cerrada", false],
  ];
  it.each(cases)("renders the %s state with its message and exit actions", (kind, title, retry) => {
    const onRetry = vi.fn();
    const onMenu = vi.fn();
    render(<StatusScreen kind={kind} onRetry={onRetry} onMenu={onMenu} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al menú" }));
    expect(onMenu).toHaveBeenCalledOnce();
    const retryButton = screen.queryByRole("button", { name: "Reintentar" });
    if (retry) {
      fireEvent.click(retryButton as HTMLElement);
      expect(onRetry).toHaveBeenCalledOnce();
    } else {
      expect(retryButton).not.toBeInTheDocument();
    }
  });
});

describe("statusKindFor", () => {
  const snap = (overrides: Partial<MultiplayerSnapshot>): MultiplayerSnapshot => ({
    status: "connected",
    room: null,
    pending: null,
    error: null,
    reactions: [],
    battle: null,
    ...overrides,
  });

  it("maps connection and error states to the screen to show", () => {
    expect(statusKindFor(snap({ status: "connecting" }))).toBe("loading");
    expect(statusKindFor(snap({ pending: "rejoin" }))).toBe("loading");
    expect(statusKindFor(snap({ status: "offline" }))).toBe("offline");
    expect(statusKindFor(snap({ status: "unavailable" }))).toBe("unavailable");
    expect(statusKindFor(snap({ status: "replaced" }))).toBe("replaced");
    expect(statusKindFor(snap({ error: { code: "ROOM_NOT_FOUND", id: 1 } }))).toBe("notFound");
    expect(statusKindFor(snap({ error: { code: "ROOM_FULL", id: 1 } }))).toBe("full");
    expect(statusKindFor(snap({ error: { code: "INVALID_TOKEN", id: 1 } }))).toBe("expired");
    expect(statusKindFor(snap({ error: { code: "TIMEOUT", id: 1 } }))).toBe("network");
    expect(statusKindFor(snap({ error: { code: "ROOM_CLOSED", id: 1 }, room: roomState() }))).toBe(
      "closed",
    );
    // A shot while the game is frozen is answered by the disconnection banner, not a screen.
    expect(statusKindFor(snap({ error: { code: "GAME_FROZEN", id: 1 } }))).toBeNull();
    // Invalid actions are a toast, not a screen.
    expect(statusKindFor(snap({ error: { code: "NOT_YOUR_TURN", id: 1 } }))).toBeNull();
    expect(statusKindFor(snap({}))).toBeNull();
  });

  it("keeps the battle on screen while reconnecting inside a room", () => {
    expect(statusKindFor(snap({ status: "reconnecting", room: roomState() }))).toBeNull();
    expect(statusKindFor(snap({ status: "reconnecting" }))).toBe("reconnecting");
  });
});
