import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function project(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return readFile((await (await download).path())!);
}

test('locks preserve every combination of controls, handle identical random draws, and leave projects/presets unchanged', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.locator('[data-motion-preset="liquid-ink"]').click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Original');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const before = await project(page);
  const library = await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'));
  const keys = ['strength', 'speed', 'phase', 'direction'] as const;
  const locks = keys.map((key) =>
    page.getByRole('button', { name: `Lock preset ${key}`, exact: true }),
  );
  const strength = page.getByRole('slider', { name: 'Preset strength', exact: true });
  const speed = page.getByRole('slider', { name: 'Preset speed', exact: true });
  const phase = page.getByRole('slider', { name: 'Preset phase', exact: true });
  const direction = page.getByLabel('Reverse preset direction', { exact: true });
  const randomize = page.getByRole('button', { name: 'Randomize preset controls', exact: true });
  const snapshot = async () => [
    await strength.inputValue(),
    await speed.inputValue(),
    await phase.inputValue(),
    String(await direction.isChecked()),
  ];
  const baseline = ['25', '25', '0', 'true'];
  const chooseSame = async () => {
    await page.evaluate(() => {
      const original = Math.random;
      (window as unknown as { restoreRandom: () => void }).restoreRandom = () => {
        Math.random = original;
      };
      Math.random = () => 0; // An identical draw must still change an unlocked control.
    });
    try {
      await randomize.click();
    } finally {
      await page.evaluate(() =>
        (window as unknown as { restoreRandom: () => void }).restoreRandom(),
      );
    }
  };
  for (let mask = 0; mask < 16; mask++) {
    // Manual editing remains possible even while a control is locked.
    await strength.fill('25');
    await speed.fill('25');
    await phase.fill('0');
    await direction.check();
    for (let i = 0; i < keys.length; i++) {
      const pressed = String(!!(mask & (1 << i)));
      if ((await locks[i].getAttribute('aria-pressed')) !== pressed) await locks[i].click();
      await expect(locks[i]).toHaveAttribute('aria-pressed', pressed);
    }
    await chooseSame();
    const values = await snapshot();
    for (let i = 0; i < keys.length; i++) if (mask & (1 << i)) expect(values[i]).toBe(baseline[i]);
    if (mask === 15) {
      expect(values).toEqual(baseline);
      await expect(page.locator('#motion-preset-controls-status')).toContainText(
        'All preset controls are locked',
      );
    } else expect(values).not.toEqual(baseline);
  }
  // All locked is also a visual no-op for built-in and saved previews.
  for (const card of [
    page.locator('[data-motion-preset="liquid-ink"]'),
    page.locator('#motion-saved-preview'),
  ]) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-preview', 'poster');
    const image = await card
      .locator('canvas')
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    await chooseSame();
    expect(await card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL())).toBe(
      image,
    );
    await expect(card).toHaveAttribute('data-preview', 'poster');
  }
  expect(await project(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  // Keyboard unlocking, then randomizing only direction, must retain focus and numeric values.
  await locks[3].focus();
  await locks[3].press('Space');
  await expect(locks[3]).toBeFocused();
  await expect(locks[3]).toHaveAttribute('aria-pressed', 'false');
  await chooseSame();
  expect(await snapshot()).toEqual(['25', '25', '0', 'false']);
  // Locked values need not belong to the randomizer's curated choices.
  await strength.fill('0');
  await speed.fill('105');
  await phase.fill('360');
  await chooseSame();
  expect(await snapshot()).toEqual(['0', '105', '360', 'true']);
  // Reset all resets values explicitly, while preserving lock choices.
  await page.getByRole('button', { name: 'Reset all preset controls', exact: true }).click();
  expect(await snapshot()).toEqual(['100', '100', '0', 'false']);
  for (const lock of locks.slice(0, 3)) await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Play previews', exact: true })).toBeVisible();
  // Applying uses locked and randomized values together; locks are never serialized.
  await chooseSame(); // Only direction is free, so it flips to true.
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  const applied = JSON.parse((await project(page)).toString());
  expect(applied.motion.timeline).toMatchObject({ amount: 35, speed: 1, phase: 0, reverse: true });
  expect(applied.motion.timeline).not.toHaveProperty('locks');
  expect(await page.evaluate(() => localStorage.getItem('dither4all-motion-presets'))).toBe(
    library,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await locks[0].scrollIntoViewIfNeeded();
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/preset-locks-mobile.png' });
});
