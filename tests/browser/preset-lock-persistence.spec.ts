import { test, expect, type Page } from '@playwright/test';

const key = 'dither4all-motion-preset-locks';
const keys = ['strength', 'speed', 'phase', 'direction'] as const;
const lock = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Lock(?:ed)? preset ${name}$`) });
async function animate(page: Page) {
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
}
async function expectLocks(page: Page, flags: boolean[]) {
  for (let i = 0; i < keys.length; i++) {
    await expect(lock(page, keys[i])).toHaveAttribute('aria-pressed', String(flags[i]));
    await expect(lock(page, keys[i])).toHaveText(flags[i] ? 'Locked' : 'Lock');
  }
}

test('lock choices survive reload and a fresh browser session, including bulk lock/unlock and reset behavior', async ({
  page,
  context,
  browser,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await animate(page);
  await lock(page, 'strength').click();
  await lock(page, 'phase').click();
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('175');
  await page.getByRole('slider', { name: 'Preset phase', exact: true }).fill('90');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved).toEqual({ strength: true, speed: false, phase: true, direction: false });
  await page.reload();
  await animate(page);
  await expectLocks(page, [true, false, true, false]);
  await expect(page.getByRole('slider', { name: 'Preset strength', exact: true })).toHaveValue(
    '100',
  );
  await expect(page.getByRole('slider', { name: 'Preset phase', exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Reset all preset controls', exact: true }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(saved);
  const fresh = await browser.newContext({
    storageState: await context.storageState(),
    reducedMotion: 'reduce',
  });
  try {
    const next = await fresh.newPage();
    await next.goto(page.url());
    await animate(next);
    await expectLocks(next, [true, false, true, false]);
    await next.getByRole('button', { name: 'Lock all preset controls', exact: true }).click();
    await next.reload();
    await animate(next);
    await expectLocks(next, [true, true, true, true]);
    await next.getByRole('button', { name: 'Randomize preset controls', exact: true }).click();
    await expect(next.locator('#motion-preset-controls-status')).toContainText(
      'All preset controls are locked',
    );
    await next.getByRole('button', { name: 'Unlock all preset controls', exact: true }).click();
    await next.reload();
    await animate(next);
    await expectLocks(next, [false, false, false, false]);
    await next.getByRole('button', { name: 'Randomize preset controls', exact: true }).click();
    await expect(next.locator('#motion-preset-controls-status')).toContainText('Randomized');
    await next.evaluate((key) => localStorage.removeItem(key), key);
    await next.reload();
    await animate(next);
    await expectLocks(next, [false, false, false, false]);
  } finally {
    await fresh.close();
  }
});

test('corrupt preferences fall back safely and failed writes keep session locks usable with a notice', async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{invalid'), key);
  await page.goto('/');
  await animate(page);
  await expectLocks(page, [false, false, false, false]);
  await expect(page.locator('#motion-preset-lock-note')).toContainText('could not be restored');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{invalid');
  await lock(page, 'strength').click();
  await expect(page.locator('#motion-preset-lock-note')).toBeHidden();
  const saved = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreLockStorage: () => void }).restoreLockStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage blocked', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await page.getByRole('button', { name: 'Lock all preset controls', exact: true }).click();
  await expectLocks(page, [true, true, true, true]);
  await expect(page.locator('#motion-preset-lock-note')).toContainText('could not be saved');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(saved);
  await page.getByRole('button', { name: 'Randomize preset controls', exact: true }).click();
  await expect(page.locator('#motion-preset-controls-status')).toContainText(
    'All preset controls are locked',
  );
  await expect(page.locator('#motion-preset-lock-note')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { restoreLockStorage: () => void }).restoreLockStorage(),
  );
  await lock(page, 'direction').click();
  await expect(page.locator('#motion-preset-lock-note')).toBeHidden();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual({
    strength: true,
    speed: true,
    phase: true,
    direction: false,
  });
});
