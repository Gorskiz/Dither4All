import { openAdvanced } from './helpers';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return Buffer.from(await readFile((await (await download).path())!));
}
async function sample(card: Locator, frame: number) {
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
  let pixels = '';
  await expect
    .poll(
      async () => {
        const value = await card.evaluate(
          (element, index) =>
            element.getAttribute('data-preview-frame') === String(index)
              ? element.querySelector('canvas')!.toDataURL()
              : '',
          frame,
        );
        if (value) pixels = value;
        return !!value;
      },
      { intervals: [30], timeout: 6000 },
    )
    .toBe(true);
  return pixels;
}

test('speed retimes built-in/custom thumbnails before applying, composes with strength and round-trips through projects and sharing', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  const speed = page.getByRole('slider', { name: 'Preset speed', exact: true });
  const card = page.locator('[data-motion-preset="orbital-drift"]');
  const originalProject = await project(page);
  const normal = await sample(card, 8);
  await speed.fill('50');
  await expect(speed).toHaveAttribute('aria-valuetext', '0.5×');
  expect(await sample(card, 16)).toBe(normal); // Twice the time, half the speed: identical pixels.
  expect(await project(page)).toEqual(originalProject);
  await speed.fill('400');
  await speed.fill('25');
  await speed.fill('200');
  expect(await sample(card, 4)).toBe(normal); // Half the time, twice the speed; stale jobs discarded.
  await card.click();
  await expect(page.getByLabel('Animation speed', { exact: true })).toHaveValue('2');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await card.click();
  await expect(page.getByLabel('Animation speed', { exact: true })).toHaveValue('2');
  const fast = await project(page);
  expect(JSON.parse(fast.toString()).motion.timeline).toMatchObject({ speed: 2, amount: 15 });
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Fast orbit');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const storage = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  await speed.fill('50');
  const custom = page.locator('#motion-saved-preview');
  expect(await sample(custom, 8)).toBe(normal); // Saved 2× times 0.5× returns to original pace.
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    storage,
  );
  expect(await project(page)).toEqual(fast);
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-speed')).toHaveValue('1');
  await expect(page.locator('#motion-amount')).toHaveValue('7.5');
  await expect(page.getByLabel('Twist 1 Amount', { exact: true })).toHaveValue('27.5');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const shared = await readFile((await (await download).path())!);
  expect(JSON.parse(shared.toString()).presets[0].appearance.speed).toBe(2);
  await page
    .locator('#motion-preset-file')
    .setInputFiles({ name: 'speed.json', mimeType: 'application/json', buffer: shared });
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-speed')).toHaveValue('1');
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'speed.d4a', mimeType: 'application/json', buffer: fast });
  await expect(page.locator('#motion-speed')).toHaveValue('2');
  await page.getByRole('button', { name: 'Reset preset speed', exact: true }).click();
  await expect(speed).toHaveValue('100');
  await expect(page.locator('#motion-preset-speed-value')).toHaveText('1×');
  await expect(page.locator('#motion-speed')).toHaveValue('2');
  await speed.focus();
  await speed.press('ArrowRight');
  await expect(speed).toHaveValue('105');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await speed.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-speed-mobile.png' });
});
