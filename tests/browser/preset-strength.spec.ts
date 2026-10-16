import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

test('strength previews built-in and saved looks without changing the project or library until applied', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const strength = page.getByRole('slider', { name: 'Preset strength', exact: true });
  const card = page.locator('[data-motion-preset="aftershock"]');
  const image = () => card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  const original = await image();
  const before = await project(page);
  await strength.fill('50');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).not.toBe(original);
  const half = await image();
  await expect(strength).toHaveAttribute('aria-valuetext', '50%');
  expect(await project(page)).toEqual(before);
  await card.click();
  await expect(page.getByLabel('Shockwave 1 Amount', { exact: true })).toHaveValue('42.5');
  await expect(page.getByLabel('Twist 2 Amount', { exact: true })).toHaveValue('17.5');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  const applied = await project(page);
  expect(applied.motion.timeline.effects.map((e: { amount: number }) => e.amount)).toEqual([
    42.5, 17.5,
  ]);
  await strength.fill('200');
  await strength.fill('0');
  await strength.fill('50');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(half);
  expect(await project(page)).toEqual(applied);
  await card.click();
  await expect(page.getByLabel('Shockwave 1 Amount', { exact: true })).toHaveValue('42.5');
  await page.getByRole('button', { name: 'Reset preset strength', exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(original);
  await expect(strength).toHaveValue('100');
  await expect(card).toHaveAttribute('aria-pressed', 'false');

  // Imported originals remain untouched, including when exporting after a strength change.
  await page.locator('#motion-preset-file').setInputFiles({
    name: 'look.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        type: 'dither4all-animation-presets',
        version: 1,
        presets: [
          {
            name: 'Orbit',
            appearance: {
              effect: 'zoom',
              amount: 30,
              cycles: 2,
              effects: [{ type: 'twist', amount: 40, cycles: 3, phase: 90, enabled: true }],
            },
          },
        ],
      }),
    ),
  });
  const custom = page.locator('#motion-saved-preview');
  const customImage = () =>
    custom.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  const customOriginal = await customImage();
  const library = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  await strength.fill('200');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  await expect.poll(customImage).not.toBe(customOriginal);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  expect(await project(page)).toEqual(applied);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.presets[0].appearance.amount).toBe(30);
  expect(exported.presets[0].appearance.effects[0].amount).toBe(40);
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-amount')).toHaveValue('60');
  await expect(page.getByLabel('Twist 1 Amount', { exact: true })).toHaveValue('80');
  const boosted = await project(page);
  expect(boosted.motion.timeline).toMatchObject({
    effect: 'zoom',
    amount: 60,
    cycles: 2,
    effects: [{ type: 'twist', amount: 80, cycles: 3, phase: 90, enabled: true }],
  });
  await strength.fill('25');
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-amount')).toHaveValue('7.5');
  await expect(page.getByLabel('Twist 1 Amount', { exact: true })).toHaveValue('10');
  await page.getByLabel('FPS', { exact: true }).selectOption('24');
  expect((await project(page)).motion.timeline.amount).toBe(7.5);
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  const currentQuarter = await customImage();
  await strength.fill('75');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  await expect.poll(customImage).not.toBe(currentQuarter);
  await strength.fill('25');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  await expect.poll(customImage).toBe(currentQuarter);
  await strength.fill('0');
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.locator('#motion-amount')).toHaveValue('0');
  await expect(page.getByLabel('Twist 1 Amount', { exact: true })).toHaveValue('0');
  await strength.focus();
  await strength.press('ArrowRight');
  await expect(strength).toHaveValue('1');
  await expect(page.locator('#motion-preset-strength-value')).toHaveText('1%');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await strength.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-strength-mobile.png', fullPage: false });
});
