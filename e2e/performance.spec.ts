import { expect, type Page, test } from "@playwright/test";

/**
 * Frame-rate budget: 60 fps in battle on desktop. Measured on the real GPU; headless
 * Chromium otherwise rasterises on the CPU (SwiftShader), which says nothing about players.
 */
test.skip(({ browserName }) => browserName !== "chromium", "GPU flags are Chromium-only");
test.use({
  reducedMotion: "no-preference",
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist"] },
});

function renderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "none";
  });
}

test("keeps the battle at desktop frame rate while a shot plays out", async ({ page }) => {
  await page.goto("/");
  const gpu = await renderer(page);
  test.skip(/SwiftShader|none/i.test(gpu), `No hardware GPU available (${gpu})`);

  await page.getByRole("button", { name: "Pulsa para comenzar" }).click();
  await page.getByRole("button", { name: "Jugar contra la IA" }).click();
  await page.getByRole("button", { name: /Alférez Ruiz/ }).click();
  await page.getByRole("button", { name: "Despliegue aleatorio" }).click();
  await page.getByRole("button", { name: "Flota lista" }).click();
  const radar = page.locator('[data-board="radar"]');
  await expect(page.locator(".battle__header .turn")).toHaveText("Tu turno · Fija un blanco");

  const sampling = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number) => {
          frames += 1;
          if (now - start < 3_000) requestAnimationFrame(tick);
          else resolve((frames * 1_000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  // Fire while sampling so the shot sequence, particles and ocean all run at once.
  await radar.locator('button[aria-label$=", sin disparar"]').first().click();
  const fps = await sampling;
  test.info().annotations.push({ type: "battle fps", description: `${fps.toFixed(1)} on ${gpu}` });
  expect(fps).toBeGreaterThanOrEqual(55);
});
