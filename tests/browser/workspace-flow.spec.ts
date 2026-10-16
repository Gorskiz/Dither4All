import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('a newcomer chooses a visual look, refines it, and exports without advanced controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await expect(page.locator('#style-browser')).not.toHaveAttribute('open');
  const look = page
    .getByRole('group', { name: 'Image looks' })
    .getByRole('button', { name: /Print club/ });
  await look.click();
  await expect(look).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('navigation', { name: 'Editor sections' })
    .getByRole('button', { name: 'Adjust', exact: true })
    .click();
  await expect(page.getByLabel('Brightness value', { exact: true })).toBeInViewport();
  await page.getByLabel('Brightness value', { exact: true }).fill('15');
  await page.getByLabel('Brightness value', { exact: true }).press('Tab');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('15');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download image', exact: true })).toBeInViewport();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const data = await readFile((await (await download).path())!);
  expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([1200, 900]);
  await expect(page.locator('#image-export-status')).toContainText('Downloaded');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole('navigation', { name: 'Editor sections' })
    .getByRole('button', { name: 'Looks', exact: true })
    .click();
  await page.screenshot({ path: 'test-results/workspace-desktop.png' });
  expect(errors).toEqual([]);
});

test('style discovery searches descriptions, filters families, remembers favorites, and uses a single keyboard entry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('Browse all 126 styles', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find' }).fill('organic');
  await expect(page.locator('.style-card:not([hidden])')).not.toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Find' }).fill('');
  await expect(page.locator('.style-card[tabindex="0"]')).toHaveCount(1);
  const entry = page.locator('.style-card[tabindex="0"]');
  await entry.focus();
  await entry.press('ArrowRight');
  await expect(page.locator('.style-card[tabindex="0"]')).toHaveAttribute(
    'data-algorithm',
    'atkinson',
  );
  await page.locator('.style-card[tabindex="0"]').press('Enter');
  await page.getByRole('button', { name: 'Favorite selected style', exact: true }).click();
  await page.getByLabel('Favorites only', { exact: true }).check();
  await expect(page.locator('.style-card:not([hidden])')).toHaveCount(1);
  await page.getByLabel('Texture family', { exact: true }).selectOption('print');
  await expect(page.locator('#style-empty')).toBeVisible();
  await page.getByLabel('Favorites only', { exact: true }).uncheck();
  await expect(page.locator('.style-card:not([hidden])')).toHaveCount(9);
  await expect(page.locator('#draft-status')).toHaveText('Draft saved on this device');
  await page.reload();
  await page.getByText('Browse all 126 styles', { exact: true }).click();
  await page.getByLabel('Favorites only', { exact: true }).check();
  await expect(page.locator('.style-card:not([hidden])')).toHaveCount(1);
});

test('phone controls keep the canvas visible, expose file actions and put animation looks before advanced controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'File', exact: true }).press('Escape');
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeHidden();
  await page
    .getByRole('navigation', { name: 'Editor sections' })
    .getByRole('button', { name: 'Motion', exact: true })
    .click();
  await expect(page.locator('#timeline')).toBeVisible();
  await expect(page.locator('#motion-advanced')).not.toHaveAttribute('open');
  await expect(page.getByLabel('Preset phase', { exact: true })).toBeHidden();
  const positions = await page.evaluate(() => ({
    looks: document.querySelector('.motion-looks')!.getBoundingClientRect().top,
    strength: document.querySelector('#motion-preset-strength')!.getBoundingClientRect().top,
  }));
  expect(positions.looks).toBeLessThan(positions.strength);
  await page.locator('[data-motion-preset="liquid-ink"]').click();
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await page.getByLabel('Motion format', { exact: true }).selectOption('gif');
  await expect(page.getByRole('button', { name: 'Download animation', exact: true })).toBeEnabled();
  await expect(page.locator('#output-canvas')).toBeInViewport();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(
      await page.locator('#export').evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/workspace-mobile-export.png' });
});

test('export proof matches full-resolution pixels, custom dimensions and quality persist through undo and recovery', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('ms');
  for (const zoom of [50, 100, 200]) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(String(zoom));
    expect(
      await page.locator('#output-canvas').evaluate((c: HTMLCanvasElement, zoom) => {
        const bounds = c.getBoundingClientRect();
        return (
          Math.abs(bounds.width - (c.width * zoom) / 100) < 0.1 &&
          Math.abs(bounds.height - (c.height * zoom) / 100) < 0.1
        );
      }, zoom),
    ).toBe(true);
  }
  await page.getByLabel('Zoom', { exact: true }).selectOption('fit');
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  await page.getByLabel('Size', { exact: true }).selectOption('custom');
  await page.getByLabel('Width (px)', { exact: true }).fill('800');
  await page.getByLabel('Width (px)', { exact: true }).press('Tab');
  await expect(page.getByLabel('Height (px)', { exact: true })).toHaveValue('600');
  await page.getByRole('button', { name: 'Inspect output pixels', exact: true }).click();
  await expect(page.locator('#proof-status')).toContainText('800 × 600');
  const proof = await page
    .locator('#proof-canvas')
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  expect(
    await page.locator('#proof-canvas').evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(800);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image', exact: true }).click();
  const data = await readFile((await (await download).path())!);
  expect(data.toString('base64')).toBe(proof.split(',')[1]);
  await page.getByLabel('Format', { exact: true }).selectOption('jpg');
  await expect(page.locator('#output-proof')).toBeHidden();
  await page.getByLabel('Quality', { exact: true }).fill('80');
  await page.getByLabel('Quality', { exact: true }).press('Tab');
  await page.locator('#undo').click();
  await expect(page.getByLabel('Quality', { exact: true })).toHaveValue('94');
  await page.locator('#redo').click();
  await expect(page.getByLabel('Quality', { exact: true })).toHaveValue('80');
  await expect(page.locator('#draft-status')).toHaveText('Draft saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  await expect(page.getByLabel('Quality', { exact: true })).toHaveValue('80');
  await expect(page.getByLabel('Width (px)', { exact: true })).toHaveValue('800');
  await expect(page.getByLabel('Format', { exact: true })).toHaveValue('jpg');
});

test('animation proof uses the selected format dimensions and invalidates when scrubbing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await page.getByLabel('Motion format', { exact: true }).selectOption('gif');
  await expect(page.locator('#export-summary')).toContainText('640 × 480');
  await page.getByRole('button', { name: 'Inspect output pixels', exact: true }).click();
  await expect(page.locator('#proof-status')).toContainText('640 × 480');
  await page.getByRole('slider', { name: 'Playhead', exact: true }).fill('1');
  await expect(page.locator('#output-proof')).toBeHidden();
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await page.getByRole('button', { name: 'Inspect output pixels', exact: true }).click();
  await expect(page.locator('#proof-status')).toContainText('128 × 96');
});
