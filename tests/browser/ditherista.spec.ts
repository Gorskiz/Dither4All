import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('expanded styles, perceptual controls, worker palette extraction and portable recipes', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await expect(page.locator('#algorithm-select option')).toHaveCount(96);
  await page.getByLabel('Find', { exact: true }).fill('Knuth');
  await expect(page.locator('#algorithm-select option:not([hidden])')).toHaveCount(4);
  await page.getByLabel('Style', { exact: true }).selectOption('dot-knuth');
  await expect(page.locator('#render-status')).toContainText('Knuth');
  await page.getByLabel('Find', { exact: true }).fill('');
  await page.getByLabel('Space', { exact: true }).selectOption('linear');
  await page.getByLabel('Match', { exact: true }).selectOption('lab');
  await page.getByLabel('Extract', { exact: true }).selectOption('wu');
  await page.getByLabel('Number of extracted colors').selectOption('32');
  await page.getByRole('button', { name: 'Extract from image', exact: true }).click();
  await expect(page.locator('#palette-colors input')).toHaveCount(32);
  await page.getByLabel('Style', { exact: true }).selectOption('ostromoukhov');
  await page.getByLabel('Serpentine scan', { exact: true }).check();
  await page.getByLabel('Jitter', { exact: true }).fill('25');
  await page.getByLabel('Jitter', { exact: true }).press('Tab');
  await expect(page.locator('#render-status')).toContainText('Ostromoukhov');
  await page.getByRole('button', { name: 'Export preset', exact: true }).click();
  // Export preset uses a normal local Blob download and retains the advanced recipe.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse((await readFile((await (await dl).path())!)).toString());
  expect(project.settings).toMatchObject({
    workingSpace: 'linear',
    colorDistance: 'lab',
    quantizer: 'wu',
    serpentine: true,
    jitter: 25,
  });
  await page.getByLabel('Style', { exact: true }).selectOption('riemersma');
  await expect(page.getByLabel('Error history', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Serpentine scan', { exact: true })).toBeHidden();
  await page.getByLabel('Style', { exact: true }).selectOption('variable-4');
  await expect(page.getByLabel('Matrix step', { exact: true })).toBeVisible();
  await page.getByLabel('Rotate', { exact: true }).selectOption('90');
  await expect(page.locator('#render-status')).toContainText('Variable 4');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Find', { exact: true }).click();
  await page.screenshot({ path: 'test-results/ditherista-desktop.png', fullPage: true });
  await page.locator('#output-canvas').click();
  await page.keyboard.press('+');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('100');
  await page.keyboard.press('.');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('fit');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ditherista-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
