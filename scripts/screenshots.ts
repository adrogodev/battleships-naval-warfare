/**
 * Plays a battle against the AI in Chromium and saves the README hero image to
 * docs/screenshots/battle.jpg.
 *
 *   pnpm build && pnpm --filter @battleships/client preview --port 4173
 *   pnpm screenshots                                 # or: pnpm screenshots --url http://host:port
 *
 * The AI game is random, so each run produces slightly different boards.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");
const urlFlag = process.argv.indexOf("--url");
const BASE_URL = urlFlag > 0 ? (process.argv[urlFlag + 1] ?? "") : "http://localhost:4173";
const YOUR_TURN = "Tu turno · Fija un blanco";
/** Fast AI so the battle advances in seconds; shaded ruled-out cells make the board richer. */
const SETTINGS = JSON.stringify({ version: 1, settings: { aiDelay: "fast", showBlocked: true } });

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

async function sunkShips(page: Page): Promise<number> {
  return page.locator('[data-board="radar"] [aria-label$="hundido"]').count();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  // 1440 × 900 laid out at twice the pixel density: sharp on retina screens and when zoomed.
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  await context.addInitScript(
    `localStorage.setItem("battleships.settings", ${JSON.stringify(SETTINGS)});`,
  );
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Pulsa para comenzar" }).click();
  await page.getByRole("button", { name: "Jugar contra la IA" }).click();
  await page.getByRole("button", { name: /Alférez Ruiz/ }).click();
  await page.getByRole("button", { name: "Despliegue aleatorio" }).click();
  await page.getByRole("button", { name: "Flota lista" }).click();
  await page.locator('[data-board="radar"]').waitFor();

  // Mid-battle with at least one enemy ship sunk, caught while a shot is in flight.
  for (let i = 0; i < 60 && (await sunkShips(page)) === 0; i++) await fireOnce(page);
  for (let i = 0; i < 6; i++) await fireOnce(page);
  await fireOnce(page);
  await page.waitForTimeout(500);
  // Park the pointer in a corner so no cell shows its hover reticle.
  await page.mouse.move(1, 1);
  await page.screenshot({ path: resolve(OUT, "battle.jpg"), type: "jpeg", quality: 92 });
  console.log("saved docs/screenshots/battle.jpg");
} finally {
  await browser.close();
}
