import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

async function pixelHash(page: Page, png?: Buffer) {
  const pixels = await page.evaluate(
    async (bytes) => {
      let canvas = document.querySelector<HTMLCanvasElement>('#output-canvas')!;
      if (bytes) {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
        );
        canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        bitmap.close();
      }
      return Array.from(
        canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
      );
    },
    png ? Array.from(png) : null,
  );
  return createHash('sha256').update(Buffer.from(pixels)).digest('hex');
}
function pngFromZip(zip: Buffer, frame: number) {
  let offset = 0;
  for (let i = 0; i <= frame; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
    expect(zip.readUInt16LE(offset + 8)).toBe(0); // Our ZIP writer stores uncompressed frames.
    const size = zip.readUInt32LE(offset + 18);
    const header = 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    if (i === frame) return zip.subarray(offset + header, offset + header + size);
    offset += header + size;
  }
  throw new Error('Missing frame');
}
async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Source motion', { exact: true }).selectOption('none');
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await expect(page.locator('#output-canvas')).toHaveAttribute('width', '128');
}
async function add(page: Page, type: string) {
  await page.getByLabel('New motion effect', { exact: true }).selectOption(type);
  await page.getByRole('button', { name: 'Add effect', exact: true }).click();
}
test('stack persists, reorders, toggles, and renders identical preview/current/sequence pixels', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.getByLabel('Duration (s)', { exact: true }).fill('1');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.getByLabel('FPS', { exact: true }).selectOption('6');
  for (const type of ['flow', 'ripple', 'glitch', 'crt', 'palette']) await add(page, type);
  await expect(page.locator('#motion-stack-count')).toHaveText('5 / 8');
  await page.getByLabel('Flowing displacement 1 Phase (°)', { exact: true }).fill('90');
  await page.getByLabel('Flowing displacement 1 Phase (°)', { exact: true }).press('Tab');
  await page.getByLabel('Flowing displacement 1 Cycles', { exact: true }).fill('2');
  await page.getByLabel('Flowing displacement 1 Cycles', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Move up CRT roll 4', exact: true }).click();
  await expect(page.locator('#motion-stack legend').nth(2)).toHaveText('3. CRT roll');
  await page.getByLabel('Enable Glitch bursts 4', { exact: true }).uncheck();
  await page.getByLabel('Playhead', { exact: true }).fill('0.5');
  const currentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current frame', exact: true }).click();
  const current = await readFile((await (await currentDownload).path())!);
  const expected = await pixelHash(page, current);
  await expect.poll(() => pixelHash(page)).toBe(expected);
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  const sequenceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  const zip = await readFile((await (await sequenceDownload).path())!);
  // Frame 3 at 6 FPS is exactly the 0.5-second scrub position.
  expect(await pixelHash(page, pngFromZip(zip, 3))).toBe(expected);
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = await readFile((await (await save).path())!);
  const saved = JSON.parse(project.toString()).motion.timeline.effects;
  expect(saved.map((e: { type: string }) => e.type)).toEqual([
    'flow',
    'ripple',
    'crt',
    'glitch',
    'palette',
  ]);
  expect(saved[0]).toMatchObject({ phase: 90, cycles: 2 });
  expect(saved[3].enabled).toBe(false);
  await page.getByRole('button', { name: 'Remove Animated ripple 2', exact: true }).click();
  await expect(page.locator('#motion-stack-count')).toHaveText('4 / 8');
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'stack.d4a', mimeType: 'application/json', buffer: project });
  await expect(page.locator('#motion-stack-count')).toHaveText('5 / 8');
  await expect(page.getByLabel('Enable Glitch bursts 4', { exact: true })).not.toBeChecked();
  await page.getByLabel('Playhead', { exact: true }).fill('0.5');
  await expect.poll(() => pixelHash(page)).toBe(expected);
  expect(errors).toEqual([]);
});
test('stack limits, keyboard controls, accessibility and narrow layout', async ({ page }) => {
  await setup(page);
  await add(page, 'flow');
  await add(page, 'ripple');
  await add(page, 'glitch');
  await add(page, 'crt');
  await add(page, 'palette');
  const enabled = page.getByLabel('Enable Flowing displacement 1', { exact: true });
  await enabled.focus();
  await enabled.press('Space');
  await expect(enabled).not.toBeChecked();
  await enabled.press('Space');
  await expect(enabled).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/motion-stack-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/motion-stack-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#motion-stack').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  for (let i = 0; i < 3; i++) await add(page, 'ripple');
  await expect(page.locator('#motion-stack-count')).toHaveText('8 / 8');
  await expect(page.getByRole('button', { name: 'Add effect', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove Animated ripple 8', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add effect', exact: true })).toBeEnabled();
});
