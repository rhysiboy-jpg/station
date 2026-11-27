// Smoke tests: the game loads, builds, runs and shows an overlay in a real browser.
import { expect, test, type Page } from "@playwright/test";

const CELL = 48;

/** Clicks grid cell (x, y); the core node's cell (0, 0) starts at the centre of the view. */
async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator("#view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width / 2 + x * CELL, box.y + box.height / 2 + y * CELL);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Start each test from a clean station.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-started")) {
      localStorage.clear();
      sessionStorage.setItem("e2e-started", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator("#view canvas")).toBeVisible();
  (page as unknown as { errors: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test("loads, places a module, runs time and toggles an overlay", async ({ page }) => {
  await expect(page.locator("#orbit-label")).toHaveText("Orbit 1");

  // Place a habitat below the core node and give it crew.
  await page.getByRole("button", { name: /^Habitat/ }).click();
  await clickCell(page, 0, 2);
  await page.keyboard.press("Escape");
  await clickCell(page, 0, 2);
  await expect(page.locator("#inspector h2")).toHaveText("Habitat");
  await page.getByRole("button", { name: "One more crew" }).click();
  await expect(page.locator("#crew-total")).toHaveText("1 / 4 beds");

  // Run time at 10x: the orbit marker moves.
  const marker = page.locator("#orbit-marker");
  const before = await marker.evaluate((el) => (el as HTMLElement).style.left);
  await page.getByRole("button", { name: "10×" }).click();
  await expect.poll(async () => marker.evaluate((el) => (el as HTMLElement).style.left), { timeout: 10_000 }).not.toBe(before);

  // Toggle the heat overlay on and off.
  const heat = page.locator('[data-overlay="heat"]');
  await page.keyboard.press("h");
  await expect(heat).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("h");
  await expect(heat).toHaveAttribute("aria-pressed", "false");
});

test("keeps the station across a reload", async ({ page }) => {
  await page.getByRole("button", { name: /^Habitat/ }).click();
  await clickCell(page, 0, 2);
  await page.keyboard.press("Escape");
  await clickCell(page, 0, 2);
  await page.getByRole("button", { name: "One more crew" }).click();
  await expect(page.locator("#crew-total")).toHaveText("1 / 4 beds");

  // Autosave happens when the tab is hidden; a reload triggers it via pagehide.
  await page.reload();
  await expect(page.locator("#crew-total")).toHaveText("1 / 4 beds");
  await expect(page.locator("#message")).toContainText("restored");
});
