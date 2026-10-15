import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('DBS exposes limits, rejects oversized output, and exports at the requested resolution', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await page.getByLabel('Style', { exact: true }).selectOption('dbs-0');
  await expect(page.getByLabel('DBS passes', { exact: true })).toBeVisible();
  await expect(page.locator('#method-budget')).toContainText('65,536');
  await expect(page.locator('#output-canvas')).toHaveAttribute('width', '128');
  await expect(page.locator('#render-status')).toContainText('DBS:');
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('65,536');
  await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeEnabled();
  await page.getByLabel('Pixel scale', { exact: true }).fill('8');
  await page.getByLabel('Pixel scale', { exact: true }).press('Tab');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  const png = await readFile((await (await dl).path())!);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(900);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/bounded-methods.png', fullPage: true });
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('FPS', { exact: true }).selectOption('24');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('12 FPS');
  await expect(page.locator('#motion-export-status')).toHaveText('Export failed.');
  await page.getByLabel('Duration (s)', { exact: true }).fill('1');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.getByLabel('FPS', { exact: true }).selectOption('6');
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  const frames = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  const zip = await readFile((await (await frames).path())!);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(7);
});
test('preview and export remain cancellable while their worker is waiting or hung', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  // Simulates a worker that never answers, proving cancellation/watchdogs independently of CPU speed.
  await page.route('**/src/worker.ts*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'self.onmessage = () => {};' }),
  );
  await page.getByLabel('Style', { exact: true }).selectOption('dbs-6');
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await expect(page.locator('#render-status')).toContainText('Preview cancelled');
  await page.getByLabel('Pixel scale', { exact: true }).fill('8');
  await page.getByLabel('Pixel scale', { exact: true }).press('Tab');
  await expect(page.locator('#render-status')).toContainText('Worker time limit', {
    timeout: 12000,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  await expect(page.locator('#cancel-image-export')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#cancel-image-export').click();
  await expect(page.locator('#toast')).toContainText('Export cancelled');
  await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeEnabled();
  await page.unroute('**/src/worker.ts*');
  await page.getByLabel('Style', { exact: true }).selectOption('grid-balanced');
  await expect(page.getByLabel('Grid width', { exact: true })).toBeVisible();
  await expect(page.locator('#render-status')).toContainText('Grid · balanced');
  await page.getByLabel('Style', { exact: true }).selectOption('curve-peano');
  await expect(page.locator('#render-status')).toContainText('Peano');
  await page.route('**/src/worker.ts*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'self.onmessage = () => {};' }),
  );
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await expect(page.locator('#render-status')).toContainText('Preview cancelled');
  await page.unroute('**/src/worker.ts*');
  await page.getByLabel('Match', { exact: true }).selectOption('lab');
  await expect(page.locator('#render-status')).toContainText('Motion preview');
});
