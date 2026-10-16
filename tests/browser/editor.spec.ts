import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('image editor processes locally, compares, edits, undoes, and exports real files', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [],
    externalRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      !r.url().startsWith(`${new URL(baseURL!).origin}/`) &&
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
  await page.getByLabel('Style', { exact: true }).selectOption('bayer-4');
  await expect(page.locator('#render-status')).toContainText('Bayer 4 × 4');
  await page.getByRole('button', { name: 'Undo settings', exact: true }).click();
  await expect(page.locator('#render-status')).toContainText('Floyd–Steinberg');
  await page.getByLabel('Palette', { exact: true }).selectOption('2');
  await expect(page.locator('#palette-colors input')).toHaveCount(4);
  await page.getByLabel('Effect to add').selectOption('scanlines');
  await page.getByRole('button', { name: 'Add an effect', exact: true }).click();
  await expect(page.locator('.effect-layer')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await page.getByLabel('Preset name', { exact: true }).fill('Browser test');
  await page.locator('#name-form').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#saved-presets')).toContainText('Browser test');
  for (const format of ['png', 'jpg', 'webp', 'svg', 'svg-black']) {
    await page.getByLabel('Format', { exact: true }).selectOption(format);
    await page.getByLabel('Size', { exact: true }).selectOption('.5');
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
  await page.getByLabel('Preset', { exact: true }).selectOption('4');
  await expect(page.locator('.effect-layer')).toHaveCount(2);
  await page.locator('#project-input').setInputFiles(projectPath!);
  await expect(page.locator('.effect-layer')).toHaveCount(0);
  await page.locator('#preset-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"settings":{"algorithm":"nonsense"}}'),
  });
  await expect(page.locator('#toast')).toContainText('Unknown dithering algorithm');
  await page.locator('#palette-input').setInputFiles({
    name: 'palette.json',
    mimeType: 'application/json',
    buffer: Buffer.from('["#112233","#ddeeff"]'),
  });
  await expect(page.locator('#palette-colors')).toContainText('#112233');
  const png = await page
    .locator('#original-canvas')
    .evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]);
  await page.getByRole('button', { name: 'Batch', exact: true }).click();
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

test('continuous inspector exposes core tools together without editing dialogs', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  for (const name of ['Style', 'Palette', 'Brightness', 'Contrast'])
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  const editor = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(editor.violations).toEqual([]);
  await page.getByLabel('Effect to add').selectOption('glow');
  await page.getByRole('button', { name: 'Add an effect', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.effect-layer')).toHaveCount(1);
  const withEffect = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(withEffect.violations).toEqual([]);
  await page.getByLabel('Style', { exact: true }).selectOption('cmyk');
  await expect(page.getByLabel('Dither strength')).toBeDisabled();
  await expect(page.getByLabel('Pattern size')).toBeEnabled();
  await expect(page.locator('#cmyk-note')).toBeVisible();
  await expect(page.getByLabel('Mode', { exact: true })).toBeDisabled();
});

test('mobile adjustments keep the image visible above the continuous inspector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await page.getByLabel('Contrast', { exact: true }).fill('35');
  await expect(page.locator('#render-status')).toContainText('ms');
  await expect(page.locator('#output-canvas')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});

test('canvas and inspector share the viewport at desktop, tablet, and phone sizes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1440, 600],
    [1024, 768],
    [820, 900],
    [390, 844],
    [320, 700],
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
    await expect(page.locator('#output-canvas')).toBeInViewport();
    await expect(page.locator('.inspector-actions')).toBeInViewport();
  }
});
