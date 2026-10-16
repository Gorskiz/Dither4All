import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('style contact sheet renders every method, filters, applies and caches previews', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const gallery = page.getByRole('group', { name: 'Style previews', exact: true });
  const cards = gallery.locator('button');
  await expect(cards).toHaveCount(126);
  // Scroll every family into view: even DBS and curve methods must finish on the tiny sample.
  const samples = new Set<string>();
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute('data-preview', 'ready');
    samples.add(
      await card.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
    );
  }
  expect(samples.size).toBeGreaterThan(80);
  await page.getByLabel('Find', { exact: true }).fill('Bayer');
  await expect(gallery.locator('button:visible')).toHaveCount(7);
  const card = gallery.locator('button:visible').first();
  const id = await card.getAttribute('data-algorithm');
  const before = await card
    .locator('canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await card.focus();
  await card.press('Enter');
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue(id!);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Brightness', { exact: true }).fill('25');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('25');
  await page.getByLabel('Find', { exact: true }).fill('no such style');
  await expect(page.locator('#style-empty')).toBeVisible();
  await expect(gallery.locator('button:visible')).toHaveCount(0);
  // The selected style remains accessible through the native select even while filtered out.
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue(id!);
  await page.getByLabel('Find', { exact: true }).fill('Bayer');
  expect(
    await card.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).toBe(before);
  await card.press('Space');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('25');
  const other = gallery.locator('button:visible').nth(1);
  await other.click();
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue(
    (await other.getAttribute('data-algorithm'))!,
  );
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('25');
  await page.getByRole('button', { name: 'Undo settings', exact: true }).click();
  await expect(page.getByLabel('Style', { exact: true })).toHaveValue(id!);
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('25');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Find', { exact: true }).fill('');
  await gallery.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByLabel('Find', { exact: true }).click();
  await page.screenshot({ path: 'test-results/style-picker-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await gallery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/style-picker-mobile.png', fullPage: true });
  // A search must lazily render a previously unseen family on a fresh mobile load.
  await page.goto('/');
  await page.getByLabel('Find', { exact: true }).fill('DBS');
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.locator('button:visible')).toHaveCount(7);
  await expect(gallery.locator('button:visible').first()).toHaveAttribute('data-preview', 'ready');
  expect(errors).toEqual([]);
});

test('style thumbnails follow uploads automatically, preserve proportions, and invalidate cached images', async ({
  page,
}) => {
  await page.goto('/');
  const gallery = page.getByRole('group', { name: 'Style previews', exact: true });
  const card = gallery.locator('button').first();
  const image = () => card.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'ready');
  const sample = await image();
  const upload = async (color: string, width: number, height: number) => {
    const data = await page.evaluate(
      ({ color, width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL().split(',')[1];
      },
      { color, width, height },
    );
    await page
      .locator('#image-input')
      .setInputFiles({
        name: 'upload.png',
        mimeType: 'image/png',
        buffer: Buffer.from(data, 'base64'),
      });
  };
  await upload('#000000', 80, 160);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('canvas')).toHaveAttribute('width', '36');
  await expect(card.locator('canvas')).toHaveAttribute('height', '72');
  await expect(card).toHaveAttribute('data-preview', 'ready');
  await expect.poll(image).not.toBe(sample);
  const black = await image();
  const pixel = () =>
    card.locator('canvas').evaluate((c) => {
      const canvas = c as HTMLCanvasElement;
      return Array.from(
        canvas
          .getContext('2d')!
          .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data,
      );
    });
  const blackPixel = await pixel();
  await upload('#ffffff', 160, 80);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('canvas')).toHaveAttribute('width', '96');
  await expect(card.locator('canvas')).toHaveAttribute('height', '48');
  await expect(card).toHaveAttribute('data-preview', 'ready');
  await expect.poll(pixel).not.toEqual(blackPixel);
  await upload('#000000', 80, 160);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-preview', 'ready');
  await expect.poll(image).toBe(black);
  // Projects replace the source too, and must update both galleries without a manual switch.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const { readFile } = await import('node:fs/promises');
  const project = await readFile((await (await download).path())!);
  await upload('#ffffff', 160, 80);
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'upload.d4a', mimeType: 'application/json', buffer: project });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('canvas')).toHaveAttribute('width', '36');
  await expect(card).toHaveAttribute('data-preview', 'ready');
  await expect.poll(image).toBe(black);
  await page.setViewportSize({ width: 320, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/uploaded-style-thumbnails-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
