import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('animation look cards animate cached samples, pause off-screen, and remain usable', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  const looks = page.getByRole('group', { name: 'Animation looks', exact: true });
  const first = looks.locator('button').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
  await expect(first.locator('canvas')).toHaveAttribute('width', '96');
  const image = () => first.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const initial = await image();
  await expect.poll(image).not.toBe(initial);
  await page.getByRole('button', { name: 'Pause previews', exact: true }).click();
  const paused = await image();
  await page.waitForTimeout(400); // Prove pixels stop changing across multiple preview ticks.
  expect(await image()).toBe(paused);
  await page.getByRole('button', { name: 'Play previews', exact: true }).click();
  await expect.poll(image).not.toBe(paused);
  await page.getByLabel('New motion effect', { exact: true }).scrollIntoViewIfNeeded();
  const hiddenFrame = await first.getAttribute('data-preview-frame');
  await page.waitForTimeout(400);
  expect(await first.getAttribute('data-preview-frame')).toBe(hiddenFrame);
  const samples = new Set<string>();
  for (const card of await looks.locator('button').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
    samples.add(await card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL()));
  }
  expect(samples.size).toBe(6);
  await page.getByLabel('Duration (s)', { exact: true }).fill('1');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.getByLabel('FPS', { exact: true }).selectOption('6');
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  await first.scrollIntoViewIfNeeded();
  // Slow only new worker messages so the export remains observable for several thumbnail ticks.
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    (window as unknown as { restoreWorker: () => void }).restoreWorker = () => {
      Worker.prototype.postMessage = original;
    };
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      setTimeout(() => Reflect.apply(original, this, args), 150);
    };
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause previews', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Reset all preset controls', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Randomize preset controls', exact: true }),
  ).toBeDisabled();
  for (const control of ['strength', 'speed', 'phase', 'direction'])
    await expect(
      page.getByRole('button', { name: `Lock preset ${control}`, exact: true }),
    ).toBeDisabled();
  for (const action of ['Lock all preset controls', 'Unlock all preset controls'])
    await expect(page.getByRole('button', { name: action, exact: true })).toBeDisabled();
  const exporting = await image();
  await page.waitForTimeout(400);
  expect(await image()).toBe(exporting);
  await download;
  await page.evaluate(() => (window as unknown as { restoreWorker: () => void }).restoreWorker());
  await expect(page.getByRole('button', { name: 'Pause previews', exact: true })).toBeEnabled();
  await expect.poll(image).not.toBe(exporting);
  await looks.getByRole('button', { name: /^Aftershock/ }).click();
  await expect(page.locator('#motion-stack legend').first()).toHaveText('1. Shockwave');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await looks.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/animated-looks-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/animated-looks-mobile.png', fullPage: true });
  expect(await looks.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced-motion users get static posters and can opt into animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
  const image = () => card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const still = await image();
  await page.waitForTimeout(400);
  expect(await image()).toBe(still);
  await page.getByRole('button', { name: 'Play previews', exact: true }).click();
  await expect.poll(image).not.toBe(still);
  // Wait for the preference event before changing it again; Chrome can coalesce rapid toggles.
  await page.evaluate(() => {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
      document.documentElement.dataset.motionPreference = String(event.matches);
    });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
});

test('failed thumbnail workers leave look buttons usable', async ({ page }) => {
  await page.goto('/');
  // A new worker for cards fails, while the editor can recover after the route is removed.
  await page.route('**/src/worker.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'self.onmessage = () => self.postMessage({ error: "Preview test failure" });',
    }),
  );
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'unavailable');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motion-stack-count')).toHaveText('2 / 8');
});
