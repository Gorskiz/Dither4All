import { openAdvanced } from './helpers';
import { test, expect } from '@playwright/test';

async function saved(page: import('@playwright/test').Page) {
  await expect(page.locator('#draft-status')).toHaveText('Draft saved on this device');
}

test('undo and redo span image settings, motion presets, layers, trim and keyframes', async ({
  page,
}) => {
  await page.goto('/');
  await openAdvanced(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.locator('[data-motion-preset="liquid-ink"]').click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await page.locator('#undo').click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(0);
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('3');
  await page.locator('#redo').click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).fill('67');
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).press('Tab');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Flowing displacement 1 Amount', { exact: true })).toHaveValue('24');
  await page.getByRole('button', { name: 'Remove Flowing displacement 1', exact: true }).click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(1);
  await page.locator('#undo').click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset motion', exact: true }).click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await page.getByLabel('Value', { exact: true }).fill('42');
  await page.getByRole('button', { name: 'Set key', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText('1 / 200');
  await page.locator('#undo').click();
  await expect(page.locator('#key-count')).toHaveText('0 / 200');
  await page.locator('#redo').click();
  await expect(page.locator('#key-count')).toHaveText('1 / 200');
  await page.getByLabel('Duration (s)', { exact: true }).fill('2');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Duration (s)', { exact: true })).toHaveValue('4');
  await page.getByLabel('Loop', { exact: true }).uncheck();
  await page.locator('#undo').click();
  await expect(page.getByLabel('Loop', { exact: true })).toBeChecked();
  await saved(page);
});

test('still view preserves the animation and draft recovery restores media and settings', async ({
  page,
}) => {
  await page.goto('/');
  await openAdvanced(page);
  await expect(page.locator('#render-status')).toContainText('ms');
  const png = await page
    .locator('#original-canvas')
    .evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]);
  await page.locator('#image-input').setInputFiles({
    name: 'recovery.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByLabel('Preset', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.locator('[data-motion-preset="liquid-ink"]').click();
  await page.getByRole('button', { name: 'Still image', exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator('#recovery-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(page.locator('#image-name')).toContainText('RECOVERY.PNG');
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('4');
  await expect(page.locator('#timeline')).toBeHidden();
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.locator('#draft-status')).toHaveText('Draft discarded');
  await page.reload();
  await expect(page.locator('#recovery-banner')).toBeHidden();
});

test('failed draft storage leaves editing, undo and project download usable', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  await openAdvanced(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('3');
  await expect(page.locator('#draft-status')).toHaveText('Draft unavailable — save a project');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('0');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.d4a$/);
});
