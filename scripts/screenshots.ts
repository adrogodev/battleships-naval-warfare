/**
 * Plays through the game in Chromium and saves the README screenshots to docs/screenshots/.
 *
 *   pnpm --filter @battleships/server start          # multiplayer server on :3001
 *   pnpm build && pnpm --filter @battleships/client preview --port 4173
 *   pnpm screenshots                                 # or: pnpm screenshots --url http://host:port
 *
 * The AI game is random, so each run produces slightly different boards.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContextOptions, chromium, type Page } from "@playwright/test";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");
const urlFlag = process.argv.indexOf("--url");
const BASE_URL = urlFlag > 0 ? (process.argv[urlFlag + 1] ?? "") : "http://localhost:4173";
const DESKTOP = { width: 1440, height: 900 };
const YOUR_TURN = "Tu turno · Fija un blanco";

/** Saved settings: fast AI so a full game takes seconds; anything else keeps its default. */
function settingsScript(settings: Record<string, unknown>): string {
  const save = JSON.stringify({ version: 1, settings: { aiDelay: "fast", ...settings } });
  return `localStorage.setItem("battleships.settings", ${JSON.stringify(save)});`;
}

async function open(
  browser: Browser,
  options: BrowserContextOptions,
  settings: Record<string, unknown> = {},
): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  // Only on the first load: later reloads must keep what the game saved.
  await context.addInitScript(
    `if (!sessionStorage.getItem("shots")) { sessionStorage.setItem("shots", "1"); ${settingsScript(settings)} }`,
  );
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

async function boot(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pulsa para comenzar" }).click();
  await page.getByRole("button", { name: "Jugar contra la IA" }).waitFor();
}

async function shot(page: Page, name: string): Promise<void> {
  // Park the pointer in a corner so no button shows its hover state, and let the screen-in
  // transition finish.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(400);
  // JPEG keeps the README light: about a third of the PNG size for these dark, soft scenes.
  await page.screenshot({ path: resolve(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });
  console.log(`saved docs/screenshots/${name}.jpg`);
}

async function startAiBattle(page: Page, commander: RegExp): Promise<void> {
  await page.getByRole("button", { name: "Jugar contra la IA" }).click();
  await page.getByRole("button", { name: commander }).click();
  await page.getByRole("button", { name: "Despliegue aleatorio" }).click();
  await page.getByRole("button", { name: "Flota lista" }).click();
  await page.locator('[data-board="radar"]').waitFor();
}

/**
 * Fires once when it is our turn, hunting around open hits first, then on a checkerboard.
 * Returns false once the game is over.
 */
async function fireOnce(page: Page): Promise<boolean> {
  const turn = page.locator(".battle__header .turn");
  const results = page.locator(".results__title");
  for (let wait = 0; wait < 300; wait++) {
    if (await results.isVisible()) return false;
    if ((await turn.textContent()) === YOUR_TURN) break;
    await page.waitForTimeout(50);
  }
  if (await results.isVisible()) return false;
  await page.evaluate(PICK_AND_FIRE);
  return true;
}

// A string, not a function: tsx (esbuild) wraps compiled functions in a `__name` helper that
// does not exist in the page.
const PICK_AND_FIRE = `(() => {
  const radar = document.querySelector('[data-board="radar"]');
  if (!radar) return;
  const cell = (c, r) => radar.querySelector('[data-coord="' + c + ':' + r + '"]');
  const open = (b) => Boolean(b && b.getAttribute("aria-label").endsWith("sin disparar"));
  let target = null;
  for (let r = 0; r < 10 && !target; r++) {
    for (let c = 0; c < 10 && !target; c++) {
      if (!cell(c, r)?.getAttribute("aria-label").endsWith("impacto")) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (open(cell(c + dc, r + dr))) { target = cell(c + dc, r + dr); break; }
      }
    }
  }
  for (let r = 0; r < 10 && !target; r++) {
    for (let c = r % 2; c < 10 && !target; c += 2) if (open(cell(c, r))) target = cell(c, r);
  }
  (target ?? radar.querySelector('button[aria-label$="sin disparar"]'))?.click();
})()`;

/** Plays until `count` own shots are fired or the game ends. */
async function play(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) if (!(await fireOnce(page))) return;
}

async function sunkShips(page: Page): Promise<number> {
  return page.locator('[data-board="radar"] [aria-label$="hundido"]').count();
}

async function desktopTour(browser: Browser): Promise<void> {
  const page = await open(
    browser,
    { viewport: DESKTOP, reducedMotion: "no-preference" },
    {
      showBlocked: true,
    },
  );
  await boot(page);
  await page.waitForTimeout(1500);
  await shot(page, "menu");

  await page.getByRole("button", { name: "Jugar contra la IA" }).click();
  await page.getByRole("button", { name: /Capitán Varela/ }).waitFor();
  await shot(page, "commanders");
  await page.getByRole("button", { name: /Alférez Ruiz/ }).click();
  await page.getByRole("button", { name: "Despliegue aleatorio" }).click();
  await shot(page, "deploy");
  await page.getByRole("button", { name: "Flota lista" }).click();
  await page.locator('[data-board="radar"]').waitFor();

  // Mid-battle with at least one enemy ship sunk, caught while a shot is in flight.
  for (let i = 0; i < 60 && (await sunkShips(page)) === 0; i++) await play(page, 1);
  await play(page, 6);
  await fireOnce(page);
  await page.waitForTimeout(500);
  await shot(page, "battle");

  await play(page, 100);
  await page.locator(".results__title").waitFor();
  await page.waitForTimeout(1200);
  await shot(page, "results");

  await page.getByRole("button", { name: "Volver al menú" }).click();
  await page.getByRole("button", { name: "Estadísticas" }).click();
  await page.waitForTimeout(400);
  await shot(page, "stats");
  await page.context().close();
}

async function tutorialTour(browser: Browser): Promise<void> {
  const page = await open(browser, { viewport: DESKTOP, reducedMotion: "reduce" });
  await boot(page);
  await page.getByRole("button", { name: "Cómo jugar" }).click();
  await page.getByRole("button", { name: "B-2, agua" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  // Miss first so the drill shows its hint, then hit.
  await page.getByRole("button", { name: "C-3, sin disparar" }).click();
  await page.getByText(/Pista/).waitFor();
  await page.getByRole("button", { name: "D-3, sin disparar" }).click();
  await page.waitForTimeout(600);
  await shot(page, "tutorial");
  await page.context().close();
}

async function accessibilityTour(browser: Browser): Promise<void> {
  const page = await open(
    browser,
    { viewport: DESKTOP, reducedMotion: "reduce" },
    { highContrast: true, colorblind: true, showBlocked: true },
  );
  await boot(page);
  await startAiBattle(page, /Alférez Ruiz/);
  for (let i = 0; i < 60 && (await sunkShips(page)) < 2; i++) await play(page, 1);
  await play(page, 4);
  await page.waitForTimeout(400);
  await shot(page, "accessibility");
  await page.context().close();
}

async function mobileTour(browser: Browser): Promise<void> {
  const page = await open(
    browser,
    {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    },
    { confirmShot: "never" },
  );
  await boot(page);
  await startAiBattle(page, /Alférez Ruiz/);
  for (let i = 0; i < 60 && (await sunkShips(page)) === 0; i++) await play(page, 1);
  await play(page, 5);
  await page.waitForTimeout(400);
  await shot(page, "mobile");
  await page.context().close();
}

async function multiplayerTour(browser: Browser): Promise<void> {
  const page = await open(browser, { viewport: DESKTOP, reducedMotion: "reduce" });
  await boot(page);
  await page.getByRole("button", { name: "Multijugador" }).click();
  await page.getByLabel("Tu alias de comandante").fill("Nemo");
  await page.getByLabel("30 s", { exact: true }).check();
  await page.getByRole("button", { name: "Crear sala privada" }).click();
  const code = (await page.locator(".room-code").textContent()) ?? "";

  const guest = await open(browser, { viewport: DESKTOP, reducedMotion: "reduce" });
  await guest.goto(`/?sala=${code}`);
  await guest.getByRole("button", { name: "Pulsa para comenzar" }).click();
  await guest.getByLabel("Tu alias de comandante").fill("Ahab");
  await guest.getByRole("button", { name: "Unirse", exact: true }).click();
  await page.getByRole("listitem", { name: "Ahab" }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, "waiting-room");
  await guest.context().close();
  await page.context().close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  await desktopTour(browser);
  await tutorialTour(browser);
  await accessibilityTour(browser);
  await mobileTour(browser);
  await multiplayerTour(browser);
} finally {
  await browser.close();
}
