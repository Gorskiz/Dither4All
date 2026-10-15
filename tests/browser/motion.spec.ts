import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function movieFixture(page: Page) {
  return page.evaluate(async () => {
    const path = '/tests/fixtures/media.ts';
    const fixture = await import(/* @vite-ignore */ path);
    return (await fixture.createVideo()) as number[];
  });
}
async function metadata(page: Page, data: Buffer) {
  return page.evaluate(async (bytes) => {
    const path = '/tests/fixtures/media.ts';
    const fixture = await import(/* @vite-ignore */ path);
    return (await fixture.inspectVideo(bytes)) as {
      duration: number;
      width: number;
      audio: number | null;
    };
  }, Array.from(data));
}
test('still animation scrubs, keyframes, plays, cancels and exports GIF/PNG sequences', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await expect(page.locator('#timeline')).toBeVisible();
  await expect(page.locator('#render-status')).toContainText('Motion preview');
  await page.getByLabel('Duration (s)', { exact: true }).fill('1');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.getByLabel('FPS', { exact: true }).selectOption('6');
  await page.getByLabel('Value', { exact: true }).fill('-30');
  await page.getByRole('button', { name: 'Set key', exact: true }).click();
  await page.getByLabel('Playhead', { exact: true }).fill('1');
  await page.getByLabel('Value', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Set key', exact: true }).click();
  await expect(page.locator('#key-count')).toHaveText('2 / 200');
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/motion-editor.png', fullPage: true });
  await page.getByLabel('Motion format', { exact: true }).selectOption('gif');
  const gifDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await expect(page.locator('#motion-export-status')).toContainText('Export ready', {
    timeout: 15000,
  });
  const gif = await readFile((await (await gifDownload).path())!);
  expect(gif.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  // Parse actual frame blocks through Chrome's image decoder, not byte-pattern guesses.
  const gifFrames = await page.evaluate(async (bytes) => {
    const Decoder = (
      window as unknown as {
        ImageDecoder: new (options: unknown) => {
          tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } };
          close: () => void;
        };
      }
    ).ImageDecoder;
    const decoder = new Decoder({ data: new Uint8Array(bytes), type: 'image/gif' });
    await decoder.tracks.ready;
    const n = decoder.tracks.selectedTrack.frameCount;
    decoder.close();
    return n;
  }, Array.from(gif));
  expect(gifFrames).toBe(6);
  await page.getByLabel('Motion format', { exact: true }).selectOption('frames');
  const framesDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  const zip = await readFile((await (await framesDownload).path())!);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(7); // Six PNGs and timing metadata.
  await page.getByLabel('Duration (s)', { exact: true }).fill('30');
  await page.getByLabel('Duration (s)', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Export animation', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.locator('#motion-export-status')).toHaveText('Export cancelled.');
  await page.getByRole('button', { name: 'Still image', exact: true }).click();
  await expect(page.locator('#timeline')).toBeHidden();
  expect(errors).toEqual([]);
});
test('video import, trim, keyframe project relink, and audio-preserving MP4/WebM export', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const bytes = await movieFixture(page);
  const file = { name: 'moving-test.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) };
  await page.locator('#image-input').setInputFiles(file);
  await expect(page.locator('#motion-kind')).toHaveText('160 × 120');
  await page.getByLabel('Style', { exact: true }).selectOption('blue-noise');
  await page.getByLabel('Space', { exact: true }).selectOption('linear');
  await page.getByLabel('Match', { exact: true }).selectOption('lab');
  await page.getByLabel('In (s)', { exact: true }).fill('0.5');
  await page.getByLabel('In (s)', { exact: true }).press('Tab');
  await page.getByLabel('Out (s)', { exact: true }).fill('1.5');
  await page.getByLabel('Out (s)', { exact: true }).press('Tab');
  await page.getByLabel('Playhead', { exact: true }).fill('1');
  await expect(page.locator('#motion-time')).toContainText('00:01.00');
  for (const format of ['mp4', 'webm']) {
    await page.getByLabel('Motion format', { exact: true }).selectOption(format);
    const supported = await page.evaluate(async (format) => {
      const path = '/tests/fixtures/media.ts';
      return (await import(/* @vite-ignore */ path)).supportsFormat(format);
    }, format);
    if (!supported) {
      await page.getByRole('button', { name: 'Export animation', exact: true }).click();
      await expect(page.locator('#motion-export-status')).toHaveText('Export failed.');
      await expect(page.locator('#toast')).toContainText('unavailable');
      continue;
    }
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export animation', exact: true }).click();
    const blob = await readFile((await (await dl).path())!);
    const meta = await metadata(page, blob);
    expect(meta.width).toBe(160);
    expect(meta.duration).toBeCloseTo(1, 1);
    expect(meta.audio).not.toBeNull();
    expect(meta.audio!).toBeGreaterThanOrEqual(0.99);
    expect(meta.audio!).toBeLessThan(1.1); // Codec packet padding can extend the encoded track.
  }
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = await readFile((await (await save).path())!);
  expect(JSON.parse(project.toString()).motion.timeline.start).toBe(0.5);
  await page
    .locator('#project-input')
    .setInputFiles({ name: 'motion.d4a', mimeType: 'application/json', buffer: project });
  await expect(page.locator('#relink-note')).toBeVisible();
  await page.locator('#image-input').setInputFiles(file);
  await expect(page.locator('#relink-note')).toBeHidden();
  await expect(page.getByLabel('In (s)', { exact: true })).toHaveValue('0.5');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: 'test-results/motion-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
