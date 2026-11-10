import { type Browser, expect, type Page, test } from "@playwright/test";

const EMPTY_CELL = 'button[aria-label$=", sin disparar"]';
const YOUR_TURN = "Tu turno · Fija un blanco";

interface Player {
  readonly page: Page;
  readonly alias: string;
  /** Uncaught page errors; every test ends by asserting there were none. */
  readonly errors: string[];
  readonly close: () => Promise<void>;
}

async function openPlayer(
  browser: Browser,
  alias: string,
  reducedMotion: "reduce" | "no-preference",
): Promise<Player> {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { page, alias, errors, close: () => context.close() };
}

async function boot(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pulsa para comenzar" }).click();
}

/** Creates a room from the menu and returns its code. */
async function createRoom(host: Player, timer: string): Promise<string> {
  await host.page.goto("/");
  await boot(host.page);
  await host.page.getByRole("button", { name: "Multijugador" }).click();
  await host.page.getByLabel("Tu alias de comandante").fill(host.alias);
  await host.page.getByLabel(timer, { exact: true }).check();
  await host.page.getByRole("button", { name: "Crear sala privada" }).click();
  const code = host.page.locator(".room-code");
  await expect(code).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  return (await code.textContent()) ?? "";
}

/** Joins through the invitation link, as a friend opening a shared URL would. */
async function joinByLink(guest: Player, code: string): Promise<void> {
  await guest.page.goto(`/?sala=${code}`);
  await boot(guest.page);
  await expect(guest.page.getByText(`Te han invitado a la sala ${code}`)).toBeVisible();
  await guest.page.getByLabel("Tu alias de comandante").fill(guest.alias);
  await guest.page.getByRole("button", { name: "Unirse", exact: true }).click();
}

async function readyAndDeploy(players: readonly Player[]): Promise<void> {
  for (const { page } of players) {
    await page.getByRole("button", { name: "Listo", exact: true }).click();
  }
  for (const { page } of players) {
    await expect(page.getByRole("heading", { name: "Despliegue de flota" })).toBeVisible();
    await page.getByRole("button", { name: "Despliegue aleatorio" }).click();
    await page.getByRole("button", { name: "Flota lista" }).click();
  }
}

const turnOf = (page: Page) => page.locator(".battle__header .turn");
const radar = (page: Page) => page.locator('[data-board="radar"]');
const resultsTitle = (page: Page) => page.locator(".results__title");

/** Waits until one player may fire; returns -1 when the game is already over. */
async function whoseTurn(players: readonly Player[]): Promise<number> {
  const check = async (): Promise<number> => {
    for (const [index, { page }] of players.entries()) {
      if (await resultsTitle(page).isVisible()) return -1;
      if ((await turnOf(page).textContent()) === YOUR_TURN) return index;
    }
    return -2;
  };
  let turn = -2;
  await expect
    .poll(
      async () => {
        turn = await check();
        return turn;
      },
      { timeout: 15_000, intervals: [50] },
    )
    .not.toBe(-2);
  return turn;
}

/** The player whose turn it is fires at the first radar cell not shot yet. */
async function fireOnce(players: readonly Player[]): Promise<boolean> {
  const turn = await whoseTurn(players);
  if (turn === -1) return false;
  const shooter = players[turn];
  if (!shooter) throw new Error(`No player for turn ${turn}`);
  const before = await shotsOnRadar(shooter.page);
  await radar(shooter.page).locator(EMPTY_CELL).first().click();
  // Sinkings also mark the cells around the ship, so the count may grow by more than one.
  await expect.poll(() => shotsOnRadar(shooter.page)).toBeGreaterThan(before);
  return true;
}

/** Radar cells that are no longer open targets (shot, sunk or ruled out). */
function shotsOnRadar(page: Page): Promise<number> {
  return radar(page)
    .locator("button[data-coord]")
    .evaluateAll(
      (cells) =>
        cells.filter((cell) => !cell.getAttribute("aria-label")?.endsWith(", sin disparar")).length,
    );
}

test("two players play a full online game and accept a rematch", async ({ browser }) => {
  const nemo = await openPlayer(browser, "Nemo", "reduce");
  const ahab = await openPlayer(browser, "Ahab", "reduce");
  const players = [nemo, ahab];
  try {
    const code = await createRoom(nemo, "Sin límite");
    await joinByLink(ahab, code);

    // Waiting room: both commanders listed in both tabs.
    for (const { page } of players) {
      await expect(page.getByRole("listitem", { name: "Nemo" })).toBeVisible();
      await expect(page.getByRole("listitem", { name: "Ahab" })).toBeVisible();
    }

    await readyAndDeploy(players);
    await expect(turnOf(nemo.page)).toBeVisible();
    await expect(turnOf(ahab.page)).toBeVisible();

    let shots = 0;
    while (await fireOnce(players)) {
      shots += 1;
      expect(shots).toBeLessThanOrEqual(200);
    }

    // Exactly one winner, and both screens agree on the outcome.
    const outcomes = await Promise.all(
      players.map(async ({ page }) => {
        await expect(resultsTitle(page)).toBeVisible();
        return resultsTitle(page).textContent();
      }),
    );
    expect(outcomes.sort()).toEqual(["Derrota", "Victoria"]);

    // Rematch: both accept and go back to deployment in the same room.
    await nemo.page.getByRole("button", { name: "Pedir revancha" }).click();
    await expect(ahab.page.getByText("Nemo quiere la revancha")).toBeVisible();
    await ahab.page.getByRole("button", { name: "Pedir revancha" }).click();
    for (const { page } of players) {
      await expect(page.getByRole("heading", { name: "Despliegue de flota" })).toBeVisible();
    }
    for (const player of players) expect(player.errors).toEqual([]);
  } finally {
    await nemo.close();
    await ahab.close();
  }
});

test("a shot travels to the local server and back in under 150 ms", async ({ browser }) => {
  const nemo = await openPlayer(browser, "Nemo", "reduce");
  const ahab = await openPlayer(browser, "Ahab", "reduce");
  const players = [nemo, ahab];
  // Socket.IO frames: time from each "shot:fire" sent to the next "shot:result" received.
  const roundTrips: number[] = [];
  for (const { page } of players) {
    let sentAt: number | null = null;
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        if (String(payload).includes('"shot:fire"')) sentAt = performance.now();
      });
      socket.on("framereceived", ({ payload }) => {
        if (sentAt !== null && String(payload).includes('"shot:result"')) {
          roundTrips.push(performance.now() - sentAt);
          sentAt = null;
        }
      });
    });
  }
  try {
    const code = await createRoom(nemo, "Sin límite");
    await joinByLink(ahab, code);
    await readyAndDeploy(players);
    for (let shot = 0; shot < 10; shot++) expect(await fireOnce(players)).toBe(true);

    expect(roundTrips.length).toBeGreaterThanOrEqual(10);
    test.info().annotations.push({
      type: "shot round trip (ms)",
      description: roundTrips.map((ms) => ms.toFixed(1)).join(", "),
    });
    expect(Math.max(...roundTrips)).toBeLessThan(150);
    for (const player of players) expect(player.errors).toEqual([]);
  } finally {
    await nemo.close();
    await ahab.close();
  }
});

test("a reload in the middle of the battle rejoins the same seat without replaying history", async ({
  browser,
}) => {
  // Full motion on purpose: replaying the history would take about a second per shot.
  const nemo = await openPlayer(browser, "Nemo", "no-preference");
  const ahab = await openPlayer(browser, "Ahab", "no-preference");
  const players = [nemo, ahab];
  try {
    const code = await createRoom(nemo, "30 s");
    await joinByLink(ahab, code);
    await readyAndDeploy(players);

    for (let shot = 0; shot < 12; shot++) expect(await fireOnce(players)).toBe(true);
    // Let the last shot finish presenting on both screens.
    await whoseTurn(players);
    const before = await shotsOnRadar(ahab.page);
    expect(before).toBeGreaterThan(0);

    await ahab.page.reload();
    await expect(nemo.page.getByText("Comandante Ahab ha perdido la conexión")).toBeVisible();
    await expect(nemo.page.getByText(/Partida congelada/)).toBeVisible();

    await boot(ahab.page);
    // History shows at once: no shot is being replayed.
    await expect(radar(ahab.page)).toBeVisible();
    await expect.poll(() => shotsOnRadar(ahab.page), { timeout: 1_500 }).toBe(before);
    await expect(turnOf(ahab.page)).not.toHaveText(/Disparo en curso|Fuego enemigo entrante/);
    await expect(nemo.page.getByText("Comandante Ahab ha perdido la conexión")).toBeHidden();

    // The game goes on after the rejoin.
    expect(await fireOnce(players)).toBe(true);
    expect(await fireOnce(players)).toBe(true);
    for (const player of players) expect(player.errors).toEqual([]);
  } finally {
    await nemo.close();
    await ahab.close();
  }
});
