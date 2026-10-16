import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function imageFile(page: Page, color: string, width: number, height: number) {
  const bytes = await page.evaluate(
    async ({ color, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return Array.from(
        new Uint8Array(
          await (
            await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
          ).arrayBuffer(),
        ),
      );
    },
    { color, width, height },
  );
  await page
    .locator('#image-input')
    .setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
}
async function saveProject(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  return JSON.parse((await readFile((await (await download).path())!)).toString());
}
test('uploaded images automatically refresh built-in and custom previews with the image recipe, preserving project settings', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await imageFile(page, '#ff0000', 80, 160);
  await page.getByLabel('Mode', { exact: true }).selectOption('rgb');
  await page.getByLabel('Contrast', { exact: true }).fill('0');
  await page.getByLabel('Contrast', { exact: true }).press('Tab');
  const first = page.locator('[data-motion-preset="liquid-ink"]');
  await expect(page.locator('#motion-preview-current')).toHaveCount(0);
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  const project = await saveProject(page);
  await expect(first.locator('canvas')).toHaveAttribute('width', '36');
  await expect(first.locator('canvas')).toHaveAttribute('height', '72');
  const pixel = () =>
    first
      .locator('canvas')
      .evaluate((c) =>
        Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(18, 36, 1, 1).data),
      );
  expect(await pixel()).toEqual([255, 0, 0, 255]);
  expect(await saveProject(page)).toEqual(project);
  await page.getByLabel('Invert source colors', { exact: true }).check();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview', 'poster');
  await expect.poll(pixel).toEqual([0, 255, 255, 255]);
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Custom');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const custom = page.locator('#motion-saved-preview');
  await custom.scrollIntoViewIfNeeded();
  await expect(custom).toHaveAttribute('data-preview', 'poster');
  await expect(custom.locator('canvas')).toHaveAttribute('width', '36');
  await expect(page.locator('#motion-saved-preview-note')).toContainText('Current image preview');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/current-image-presets-mobile.png', fullPage: true });
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  // A new source invalidates caches even if the image recipe is unchanged.
  await imageFile(page, '#0000ff', 160, 80);
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('canvas')).toHaveAttribute('width', '96');
  await expect(first.locator('canvas')).toHaveAttribute('height', '48');
  await expect(first).toHaveAttribute('data-preview', 'poster');
  const center = await first
    .locator('canvas')
    .evaluate((c) =>
      Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(48, 24, 1, 1).data),
    );
  expect(center).toEqual([255, 255, 0, 255]);
});
