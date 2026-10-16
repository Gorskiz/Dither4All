import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return readFile((await (await download).path())!);
}

test('randomize previews valid variations without applying, supports keyboard/repeated clicks, and keeps the saved original', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  const image = () => card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  const original = await image();
  await card.click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Liquid');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const before = await project(page);
  const library = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  const randomize = page.getByRole('button', { name: 'Randomize preset controls', exact: true });
  const strength = page.getByRole('slider', { name: 'Preset strength', exact: true });
  const speed = page.getByRole('slider', { name: 'Preset speed', exact: true });
  const phase = page.getByRole('slider', { name: 'Preset phase', exact: true });
  const reverse = page.getByLabel('Reverse preset direction', { exact: true });
  const choose = async (values: number[], keyboard = false) => {
    await page.evaluate((values) => {
      const original = Math.random;
      let index = 0;
      (window as unknown as { restoreRandom: () => void }).restoreRandom = () => {
        Math.random = original;
      };
      Math.random = () => values[index++] ?? original();
    }, values);
    try {
      if (keyboard) {
        await randomize.focus();
        await randomize.press('Enter');
      } else await randomize.click();
    } finally {
      await page.evaluate(() =>
        (window as unknown as { restoreRandom: () => void }).restoreRandom(),
      );
    }
  };
  await choose([0.5, 0.5, 0.25, 0.1], true);
  await expect(randomize).toBeFocused();
  await expect(strength).toHaveValue('115');
  await expect(strength).toHaveAttribute('aria-valuetext', '115%');
  await expect(speed).toHaveValue('125');
  await expect(speed).toHaveAttribute('aria-valuetext', '1.25×');
  await expect(phase).toHaveValue('90');
  await expect(phase).toHaveAttribute('aria-valuetext', '90°');
  await expect(reverse).toBeChecked();
  await expect(page.locator('#motion-preset-controls-status')).toContainText(
    'Randomized: 115% strength, 1.25× speed, 90° phase, flipped direction',
  );
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
  expect(await project(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).not.toBe(original);
  const variation = await image();
  const custom = page.locator('#motion-saved-preview');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  expect(await custom.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(
    variation,
  );
  // Exercise the extremes and an identical RNG draw while work is pending.
  await choose([0, 0, 0, 0]);
  await expect(strength).toHaveValue('25');
  await expect(speed).toHaveValue('25');
  await expect(phase).toHaveValue('0');
  await choose([0.999, 0.999, 0.999, 0.999]);
  await expect(strength).toHaveValue('200');
  await expect(speed).toHaveValue('400');
  await expect(phase).toHaveValue('345');
  await expect(reverse).not.toBeChecked();
  await choose([0.999, 0.999, 0.999, 0.999]);
  await expect(phase).toHaveValue('0'); // An identical draw still produces a new combination.
  await choose([0.5, 0.5, 0.25, 0.1]);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(variation);
  await card.click();
  const applied = JSON.parse((await project(page)).toString());
  expect(applied.motion.timeline).toMatchObject({
    amount: 40.25,
    speed: 1.25,
    phase: 90,
    reverse: true,
  });
  expect(applied.motion.timeline.effects.map((e: { amount: number }) => e.amount)).toEqual([
    27.6, 23,
  ]);
  // Reset restores the original thumbnails; the randomized look stays applied until another Apply.
  await page.getByRole('button', { name: 'Reset all preset controls', exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(original);
  expect(JSON.parse((await project(page)).toString())).toEqual(applied);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await randomize.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-randomize-mobile.png' });
});
