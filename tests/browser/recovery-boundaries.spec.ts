import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openAdvanced } from './helpers';

test('video draft relinks original media with its timeline, and still-view projects retain animation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAdvanced(page);
  const bytes = await page.evaluate(async () => {
    const path = '/tests/fixtures/media.ts';
    return (await import(/* @vite-ignore */ path)).createVideo() as Promise<number[]>;
  });
  const file = { name: 'relink-recovery.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) };
  await page.locator('#image-input').setInputFiles(file);
  await page.getByLabel('In (s)', { exact: true }).fill('0.5');
  await page.getByLabel('In (s)', { exact: true }).press('Tab');
  await page.locator('[data-motion-preset="liquid-ink"]').click();
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  await page.getByRole('button', { name: 'Still image', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse((await readFile((await (await download).path())!)).toString());
  expect(project.motion.active).toBe(false);
  expect(project.motion.timeline.effects).toHaveLength(2);
  await expect(page.locator('#draft-status')).toHaveText('Draft saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(page.locator('#timeline')).toBeHidden();
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await expect(page.locator('#relink-note')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download animation', exact: true }),
  ).toBeDisabled();
  await page.locator('#image-input').setInputFiles(file);
  await expect(page.locator('#relink-note')).toBeHidden();
  await expect(page.getByLabel('In (s)', { exact: true })).toHaveValue('0.5');
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
  await expect(page.getByLabel('Motion format', { exact: true })).toHaveValue('frames');
  const frames = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download animation', exact: true }).click();
  expect((await frames).suggestedFilename()).toMatch(/\.zip$/);
  await page.locator('#project-input').setInputFiles({
    name: 'retained.d4a',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('#timeline')).toBeHidden();
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await expect(page.locator('.motion-effect-card')).toHaveCount(2);
});

test('corrupt recovery is dismissible and rapid edits restore the latest committed state', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('dither4all-recovery', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(
          { version: 999, name: 'broken', image: new ArrayBuffer(1) },
          'current',
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.locator('#recovery-message')).toContainText('could not be read');
  await expect(page.getByRole('button', { name: 'Restore draft', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.locator('#recovery-banner')).toBeHidden();
  for (const value of ['12', '-13', '42']) {
    await page.getByLabel('Brightness', { exact: true }).fill(value);
    await page.getByLabel('Brightness', { exact: true }).press('Tab');
  }
  await page.locator('#undo').click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('-13');
  await page.getByLabel('Brightness', { exact: true }).fill('27');
  await page.getByLabel('Brightness', { exact: true }).press('Tab');
  await expect(page.locator('#redo')).toBeDisabled();
  await expect(page.locator('#draft-status')).toHaveText('Draft saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('27');
});
