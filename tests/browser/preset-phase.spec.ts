import { openAdvanced } from './helpers';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return readFile((await (await download).path())!);
}
async function poster(card: Locator) {
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  return card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}

test('preset phase previews a shifted start, wraps full turns, and applies/shares original offsets without compounding', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  const slider = page.getByRole('slider', { name: 'Preset phase', exact: true });
  const card = page.locator('[data-motion-preset="orbital-drift"]');
  const original = await poster(card);
  const before = await project(page);
  await page.getByRole('button', { name: 'Play previews', exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'ready', { timeout: 15000 });
  let quarter = '';
  await expect
    .poll(
      async () => {
        quarter = await card.evaluate((e) =>
          e.dataset.previewFrame === '8' ? e.querySelector('canvas')!.toDataURL() : '',
        );
        return !!quarter;
      },
      { intervals: [30], timeout: 6000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Pause previews', exact: true }).click();
  await slider.fill('90');
  expect(await poster(card)).toBe(quarter); // 90° shifts source zoom and the single-cycle layers to the same pixels as the one-second frame.
  await expect(slider).toHaveAttribute('aria-valuetext', '90°');
  expect(await project(page)).toEqual(before);
  await slider.fill('360');
  expect(await poster(card)).toBe(original);
  await slider.fill('45');
  await slider.fill('270');
  await slider.fill('90');
  expect(await poster(card)).toBe(quarter);
  await card.click();
  await expect(page.getByLabel('Animation phase (°)', { exact: true })).toHaveValue('90');
  await expect(page.getByLabel('Twist 1 Phase (°)', { exact: true })).toHaveValue('90');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await card.click();
  await expect(page.locator('#motion-phase')).toHaveValue('90');
  const applied = await project(page);
  expect(JSON.parse(applied.toString()).motion.timeline.phase).toBe(90);
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Quarter orbit');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const storage = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  await slider.fill('270');
  const custom = page.locator('#motion-saved-preview');
  expect(await poster(custom)).toBe(original); // Saved 90° plus 270° wraps to 0°.
  expect(await project(page)).toEqual(applied);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    storage,
  );
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-phase')).toHaveValue('0');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const shared = await readFile((await (await download).path())!);
  expect(JSON.parse(shared.toString()).presets[0].appearance.phase).toBe(90);
  await page
    .locator('#motion-preset-file')
    .setInputFiles({ name: 'phase.json', mimeType: 'application/json', buffer: shared });
  await slider.fill('45');
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('50');
  await page.getByRole('slider', { name: 'Preset speed', exact: true }).fill('150');
  await page.getByLabel('Reverse preset direction', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  const composed = JSON.parse((await project(page)).toString());
  expect(composed.motion.timeline).toMatchObject({
    phase: 135,
    speed: 1.5,
    reverse: true,
    amount: 7.5,
  });
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'phase.d4a', mimeType: 'application/json', buffer: applied });
  await expect(page.locator('#motion-phase')).toHaveValue('90');
  await page.getByRole('button', { name: 'Reset preset phase', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.locator('#motion-phase')).toHaveValue('90');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('#motion-preset-phase-value')).toHaveText('1°');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await slider.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-phase-mobile.png' });
});
