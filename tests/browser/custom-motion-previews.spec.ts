import { openAdvanced } from './helpers';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('saved/imported preview selection animates without applying, stays fresh after rapid changes, and follows rename/delete', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  const select = page.getByLabel('Your saved animation presets', { exact: true });
  const preview = page.locator('#motion-saved-preview');
  await expect(page.locator('#motion-saved-preview-region')).toBeHidden();
  await page.getByRole('button', { name: /^Mirror Lake/ }).click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Lake');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
  const image = () =>
    preview.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const first = await image();
  await expect.poll(image).not.toBe(first);
  await page.getByRole('button', { name: 'Pause all previews', exact: true }).click();
  const paused = await image();
  await page.waitForTimeout(350);
  expect(await image()).toBe(paused);
  await page.getByRole('button', { name: 'Rename preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('<b>Moon lake</b>');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  await expect(page.locator('#motion-saved-preview-name')).toHaveText('<b>Moon lake</b>');
  expect(await image()).toBe(paused); // Renaming reuses cached pixels.
  const payload = {
    type: 'dither4all-animation-presets',
    version: 1,
    presets: [
      { name: 'Still', appearance: { effect: 'none', amount: 35, cycles: 1, effects: [] } },
      {
        name: 'Twist',
        appearance: {
          effect: 'none',
          amount: 35,
          cycles: 1,
          effects: [{ type: 'twist', enabled: true, amount: 100, cycles: 2, phase: 90 }],
        },
      },
    ],
  };
  await page.locator('#motion-preset-file').setInputFiles({
    name: 'looks.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator('#motion-saved-preview-name')).toHaveText('Still');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('data-preview', 'poster');
  const still = await image();
  await expect(page.locator('#motion-stack legend').nth(1)).toHaveText('2. Water reflection');
  await select.selectOption({ label: 'Twist' });
  await select.selectOption({ label: 'Still' });
  await expect(preview).toHaveAttribute('data-preview', 'poster');
  expect(await image()).toBe(still);
  await select.selectOption({ label: 'Twist' });
  await expect(preview).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).not.toBe(still);
  await expect(page.locator('#motion-stack legend').nth(1)).toHaveText('2. Water reflection');
  await page.getByRole('button', { name: 'Play all previews', exact: true }).click();
  await expect(preview).toHaveAttribute('data-preview', 'ready');
  const moving = await image();
  await expect.poll(image).not.toBe(moving);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/custom-motion-preview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/custom-motion-preview-mobile.png', fullPage: true });
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(page.locator('#motion-saved-preview-region')).toBeHidden();
  await expect(page.locator('#motion-stack legend').nth(1)).toHaveText('2. Water reflection');
});

test('saved preview uses a static poster with reduced motion and refreshes after another tab replaces its appearance', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByRole('button', { name: /^Aftershock/ }).click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Shock');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const preview = page.locator('#motion-saved-preview');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('data-preview', 'poster');
  const image = () =>
    preview.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const poster = await image();
  await page.waitForTimeout(350);
  expect(await image()).toBe(poster);
  const other = await context.newPage();
  await other.goto(page.url());
  await openAdvanced(other);
  await other.evaluate(() => {
    const key = 'dither4all-motion-presets';
    const presets = JSON.parse(localStorage.getItem(key)!);
    presets[0].appearance = { effect: 'none', amount: 35, cycles: 1, effects: [] };
    localStorage.setItem(key, JSON.stringify(presets));
  });
  await page.bringToFront();
  await expect.poll(image).not.toBe(poster);
  await expect(preview).toHaveAttribute('data-preview', 'poster');
  await expect(page.locator('#motion-stack legend').first()).toHaveText('1. Shockwave');
  await other.close();
});
