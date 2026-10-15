import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('image editor processes locally, compares, edits, undoes, and exports real files', async ({
  page,
}) => {
  const errors: string[] = [],
    externalRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:5173') &&
      !r.url().startsWith('data:') &&
      !r.url().startsWith('blob:')
    )
      externalRequests.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
  await expect(page.locator('#output-canvas')).toHaveAttribute('width', '1100');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByLabel('Original / dithered split')).toBeVisible();
  await page.getByLabel('Original / dithered split').fill('30');
  await expect(page.locator('#output-canvas')).toHaveCSS('clip-path', 'inset(0px 0px 0px 30%)');
  await page.getByRole('button', { name: 'Dithered', exact: true }).click();
  await page.getByRole('button', { name: 'Bayer 4 × 4', exact: false }).click();
  await expect(page.locator('#render-status')).toContainText('Bayer 4 × 4');
  await page.getByRole('button', { name: 'Undo settings', exact: true }).click();
  await expect(page.locator('#render-status')).toContainText('Floyd–Steinberg');
  await page.getByRole('tab', { name: 'Palette', exact: true }).click();
  await page.getByLabel('Palette library').selectOption('2');
  await expect(page.locator('#palette-colors input')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add an effect', exact: true }).click();
  await page.locator('[data-add-effect="scanlines"]').click();
  await expect(page.locator('.effect-layer')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save as preset', exact: true }).click();
  await page.getByLabel('Preset name').fill('Browser test');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.locator('#saved-presets')).toContainText('Browser test');
  for (const format of ['png', 'jpg', 'webp', 'svg', 'svg-black']) {
    await page.getByLabel('Export format').selectOption(format);
    await page.getByLabel('Output size').selectOption('.5');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export image', exact: true }).click();
    const file = await download,
      path = await file.path(),
      data = await readFile(path!);
    if (format === 'png') {
      expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([600, 450]);
    }
    if (format === 'jpg') expect(data.subarray(0, 2).toString('hex')).toBe('ffd8');
    if (format === 'webp') expect(data.subarray(8, 12).toString()).toBe('WEBP');
    if (format.startsWith('svg')) {
      expect(data.toString()).toContain('<path');
      expect(data.toString()).not.toContain('<image');
    }
  }
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
});

test('project round trip, malformed input, palette import, and image batch', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await saved,
    projectPath = await file.path();
  await page.locator('.preset-drawer > summary').click();
  await page.getByRole('button', { name: 'Signal lost', exact: false }).click();
  await expect(page.locator('.effect-layer')).toHaveCount(2);
  await page.locator('#project-input').setInputFiles(projectPath!);
  await expect(page.locator('.effect-layer')).toHaveCount(0);
  await page.locator('#preset-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"settings":{"algorithm":"nonsense"}}'),
  });
  await expect(page.locator('#toast')).toContainText('Unknown dithering algorithm');
  await page.getByRole('tab', { name: 'Palette', exact: true }).click();
  await page.locator('#palette-input').setInputFiles({
    name: 'palette.json',
    mimeType: 'application/json',
    buffer: Buffer.from('["#112233","#ddeeff"]'),
  });
  await expect(page.locator('#palette-colors')).toContainText('#112233');
  const png = await page
    .locator('#original-canvas')
    .evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]);
  await page.getByRole('button', { name: 'Batch images', exact: true }).click();
  await page.locator('#batch-input').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    { name: 'two.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
  ]);
  const batch = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process & download ZIP', exact: false }).click();
  const zip = await batch,
    bytes = await readFile((await zip.path())!);
  await zip.saveAs('test-results/batch.zip');
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(bytes.readUInt16LE(bytes.length - 12)).toBe(2);
  await expect(page.locator('#batch-status')).toContainText('Done. 2 images');
});

test('editor and effects dialog expose accessible names and readable controls', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  const editor = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(editor.violations).toEqual([]);
  await page.getByRole('button', { name: 'Add an effect', exact: true }).click();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(dialog.violations).toEqual([]);
  await page.getByRole('button', { name: 'Close effects', exact: true }).click();
  await page.getByRole('tab', { name: 'Dither', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Palette', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Dither', exact: true }).click();
  await page.getByRole('button', { name: 'Pattern', exact: true }).click();
  await page.getByRole('button', { name: 'CMYK halftone', exact: false }).click();
  await expect(page.getByLabel('Dither strength')).toBeDisabled();
  await expect(page.getByLabel('Pattern size')).toBeEnabled();
  await page.getByRole('tab', { name: 'Palette', exact: true }).click();
  await expect(page.locator('#cmyk-note')).toBeVisible();
  await expect(page.getByLabel('Color mode')).toBeDisabled();
});

test('mobile layout stays within viewport and dialogs remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Effects & export', exact: true }).click();
  await page.getByRole('button', { name: 'Add an effect', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close effects', exact: true }).click();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Image', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Effects & export', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
});

test('workspace fills the viewport and keeps panels usable when resized', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1440, 600],
    [1024, 768],
    [820, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.locator('.studio').boundingBox();
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBe(width);
    expect(Math.round(bounds!.y + bounds!.height)).toBe(height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width >= 1200) {
      const first = await page.getByRole('button', { name: 'All', exact: true }).boundingBox();
      const last = await page.getByRole('button', { name: 'Other', exact: true }).boundingBox();
      expect(first!.y).toBe(last!.y);
    }
    if (width <= 1000) {
      await page.getByRole('button', { name: 'Dither & color', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Dither', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Effects & export', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Image', exact: true }).click();
    }
    await expect(page.locator('#output-canvas')).toBeVisible();
  }
});
