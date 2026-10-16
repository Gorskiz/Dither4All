import { openAdvanced } from './helpers';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return readFile((await (await download).path())!);
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

test('reverse previews the original direction with speed/strength, applies once, and survives projects and sharing', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await page.getByRole('slider', { name: 'Preset speed', exact: true }).fill('150');
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('50');
  const reverse = page.getByLabel('Reverse preset direction', { exact: true });
  const applied = page.getByLabel('Reverse animation', { exact: true });
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  const before = await project(page);
  const forward = await sample(card, 24);
  await reverse.check();
  expect(await sample(card, 8)).toBe(forward); // Reversed at one second equals forward at three seconds, including speed/strength.
  expect(await project(page)).toEqual(before);
  await expect(applied).not.toBeChecked();
  await reverse.uncheck();
  await reverse.check();
  await reverse.uncheck();
  expect(await sample(card, 24)).toBe(forward);
  await reverse.check();
  await card.click();
  await expect(applied).toBeChecked();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await card.click();
  await expect(applied).toBeChecked(); // Reapply from the original, rather than flipping the current timeline.
  await expect(page.locator('#motion-speed')).toHaveValue('1.5');
  await expect(page.getByLabel('Flowing displacement 1 Amount', { exact: true })).toHaveValue('12');
  const reversed = await project(page);
  expect(JSON.parse(reversed.toString()).motion.timeline.reverse).toBe(true);
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Reverse liquid');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const storage = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('100');
  await page.getByRole('button', { name: 'Reset preset speed', exact: true }).click();
  const custom = page.locator('#motion-saved-preview');
  expect(await sample(custom, 24)).toBe(forward); // Reversed saved original + reverse toggle plays forward.
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    storage,
  );
  expect(await project(page)).toEqual(reversed);
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(applied).not.toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const shared = await readFile((await (await download).path())!);
  expect(JSON.parse(shared.toString()).presets[0].appearance.reverse).toBe(true);
  await page
    .locator('#motion-preset-file')
    .setInputFiles({ name: 'reverse.json', mimeType: 'application/json', buffer: shared });
  await reverse.uncheck();
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(applied).toBeChecked();
  await applied.uncheck();
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'reverse.d4a', mimeType: 'application/json', buffer: reversed });
  await expect(applied).toBeChecked();
  const current = await sample(custom, 8);
  await reverse.check();
  expect(await sample(custom, 24)).toBe(current); // Same direction mapping with the current-image recipe.
  await reverse.focus();
  await reverse.press('Space');
  await expect(reverse).not.toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await reverse.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-reverse-mobile.png' });
});

test('reduced motion uses reversed posters and preserves the pause setting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByRole('slider', { name: 'Preset speed', exact: true }).fill('150');
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  const image = () => card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const forward = await image();
  await page.getByLabel('Reverse preset direction', { exact: true }).check();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).not.toBe(forward);
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
});
