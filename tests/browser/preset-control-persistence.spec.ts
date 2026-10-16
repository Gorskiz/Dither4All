import { test, expect, type Page } from '@playwright/test';

const valuesKey = 'dither4all-motion-preset-controls';
const locksKey = 'dither4all-motion-preset-locks';
async function animate(page: Page) {
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
}
async function expectControls(
  page: Page,
  controls: { strength: number; speed: number; phase: number; reverse: boolean },
) {
  for (const [name, value, text] of [
    ['strength', controls.strength, `${controls.strength}%`],
    ['speed', Math.round(controls.speed * 100), `${controls.speed}×`],
    ['phase', controls.phase, `${controls.phase}°`],
  ] as const) {
    const slider = page.getByRole('slider', { name: `Preset ${name}`, exact: true });
    await expect(slider).toHaveValue(String(value));
    await expect(slider).toHaveAttribute('aria-valuetext', text);
  }
  if (controls.reverse)
    await expect(page.getByLabel('Reverse preset direction', { exact: true })).toBeChecked();
  else await expect(page.getByLabel('Reverse preset direction', { exact: true })).not.toBeChecked();
}
async function poster(page: Page) {
  const card = page.locator('[data-motion-preset="liquid-ink"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'poster');
  return card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}

test('values and locks restore together with matching thumbnails, and resets/randomize save the new browsing values', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await animate(page);
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('87');
  await page.getByRole('slider', { name: 'Preset speed', exact: true }).fill('115');
  await page.getByRole('slider', { name: 'Preset phase', exact: true }).fill('360');
  await page.getByLabel('Reverse preset direction', { exact: true }).check();
  await page.getByRole('button', { name: 'Lock preset strength', exact: true }).click();
  await page.getByRole('button', { name: 'Lock preset direction', exact: true }).click();
  const values = { strength: 87, speed: 1.15, phase: 360, reverse: true };
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), valuesKey)).toEqual(
    values,
  );
  const original = await poster(page);
  await page.reload();
  await animate(page);
  await expectControls(page, values);
  expect(await poster(page)).toBe(original);
  // Restoring preview preferences never applies them to the animation timeline.
  await expect(page.locator('#motion-amount')).toHaveValue('35');
  await expect(page.locator('#motion-speed')).toHaveValue('1');
  await expect(page.locator('#motion-phase')).toHaveValue('0');
  await expect(page.getByLabel('Reverse animation', { exact: true })).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Locked preset strength', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const fresh = await browser.newContext({
    storageState: await context.storageState(),
    reducedMotion: 'reduce',
  });
  try {
    const next = await fresh.newPage();
    await next.goto(page.url());
    await animate(next);
    await expectControls(next, values);
    expect(await poster(next)).toBe(original);
    await expect(
      next.getByRole('button', { name: 'Locked preset direction', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await next.getByRole('button', { name: 'Reset preset phase', exact: true }).click();
    await next.reload();
    await animate(next);
    await expectControls(next, { ...values, phase: 0 });
    await next.getByRole('button', { name: 'Reset all preset controls', exact: true }).click();
    await next.reload();
    await animate(next);
    await expectControls(next, { strength: 100, speed: 1, phase: 0, reverse: false });
    await next.getByRole('button', { name: 'Randomize preset controls', exact: true }).click();
    const random = await next.evaluate((key) => JSON.parse(localStorage.getItem(key)!), valuesKey);
    expect(random.strength).toBe(100); // Restored locks also govern Randomize.
    expect(random.reverse).toBe(false);
    const pixels = await poster(next);
    await next.reload();
    await animate(next);
    await expectControls(next, random);
    expect(await poster(next)).toBe(pixels);
    await next.evaluate((key) => localStorage.removeItem(key), valuesKey);
    await next.reload();
    await animate(next);
    await expectControls(next, { strength: 100, speed: 1, phase: 0, reverse: false });
    await expect(
      next.getByRole('button', { name: 'Locked preset strength', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await fresh.close();
  }
});

test('invalid values keep valid locks and session edits recover after storage failures', async ({
  page,
}) => {
  await page.addInitScript(
    ({ valuesKey, locksKey }) => {
      localStorage.setItem(valuesKey, '{invalid');
      localStorage.setItem(
        locksKey,
        JSON.stringify({ strength: true, speed: false, phase: true, direction: false }),
      );
    },
    { valuesKey, locksKey },
  );
  await page.goto('/');
  await animate(page);
  await expectControls(page, { strength: 100, speed: 1, phase: 0, reverse: false });
  await expect(
    page.getByRole('button', { name: 'Locked preset strength', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motion-preset-values-note')).toContainText('could not be restored');
  expect(await page.evaluate((key) => localStorage.getItem(key), valuesKey)).toBe('{invalid');
  await page.getByRole('slider', { name: 'Preset phase', exact: true }).fill('90');
  await expect(page.locator('#motion-preset-values-note')).toBeHidden();
  const saved = await page.evaluate((key) => localStorage.getItem(key), valuesKey);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreValueStorage: () => void }).restoreValueStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, valuesKey);
  await page.getByRole('slider', { name: 'Preset strength', exact: true }).fill('120');
  await expectControls(page, { strength: 120, speed: 1, phase: 90, reverse: false });
  await expect(page.locator('#motion-preset-values-note')).toContainText('could not be saved');
  expect(await page.evaluate((key) => localStorage.getItem(key), valuesKey)).toBe(saved);
  await page.getByRole('button', { name: 'Unlock all preset controls', exact: true }).click();
  await expect(page.locator('#motion-preset-values-note')).toBeVisible(); // A lock write cannot hide a value-save failure.
  await page.evaluate(() =>
    (window as unknown as { restoreValueStorage: () => void }).restoreValueStorage(),
  );
  await page.getByRole('button', { name: 'Reset preset speed', exact: true }).click();
  await expect(page.locator('#motion-preset-values-note')).toBeHidden();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), valuesKey)).toEqual({
    strength: 120,
    speed: 1,
    phase: 90,
    reverse: false,
  });
});
