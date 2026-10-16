import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return readFile((await (await download).path())!);
}

test('reset all restores browsing defaults and built-in/custom thumbnails without applying or altering saved presets', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const first = page.locator('[data-motion-preset="liquid-ink"]');
  const image = () => first.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  const original = await image();
  await first.click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Liquid');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const library = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  const strength = page.getByRole('slider', { name: 'Preset strength', exact: true });
  const speed = page.getByRole('slider', { name: 'Preset speed', exact: true });
  const phase = page.getByRole('slider', { name: 'Preset phase', exact: true });
  const reverse = page.getByLabel('Reverse preset direction', { exact: true });
  const reset = page.getByRole('button', { name: 'Reset all preset controls', exact: true });
  await strength.fill('150');
  await speed.fill('150');
  await phase.fill('90');
  await reverse.check();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).not.toBe(original);
  await first.click();
  const applied = await project(page);
  await reset.click();
  await expect(strength).toHaveValue('100');
  await expect(strength).toHaveAttribute('aria-valuetext', '100%');
  await expect(speed).toHaveValue('100');
  await expect(speed).toHaveAttribute('aria-valuetext', '1×');
  await expect(phase).toHaveValue('0');
  await expect(phase).toHaveAttribute('aria-valuetext', '0°');
  await expect(reverse).not.toBeChecked();
  await expect(page.locator('#motion-preset-strength-value')).toHaveText('100%');
  await expect(page.locator('#motion-preset-speed-value')).toHaveText('1×');
  await expect(page.locator('#motion-preset-phase-value')).toHaveText('0°');
  await expect(page.locator('#motion-preset-controls-status')).toContainText(
    'Preset controls reset',
  );
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
  expect(await project(page)).toEqual(applied);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(original);
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  const custom = page.locator('#motion-saved-preview');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  expect(await custom.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(
    original,
  );
  // Keyboard reset during new thumbnail work must discard replies from the previous controls.
  await strength.fill('75');
  await speed.fill('200');
  await phase.fill('180');
  await reverse.check();
  await reset.focus();
  await reset.press('Enter');
  await expect(reset).toBeFocused();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  await expect.poll(image).toBe(original);
  await reset.click(); // Already at defaults: keep the same result.
  expect(await project(page)).toEqual(applied);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await reset.scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-reset-mobile.png' });
});
