import { openAdvanced } from './helpers';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('custom animation presets save, survive reload, apply, rename and delete without changing the current animation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await page.getByRole('button', { name: /^Mirror Lake/ }).click();
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).fill('61');
  await page.getByLabel('Flowing displacement 1 Amount', { exact: true }).press('Tab');
  await page.getByLabel('Enable Water reflection 2', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('My lake');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const select = page.getByLabel('Your saved animation presets', { exact: true });
  const id = await select.inputValue();
  await expect(page.locator('#motion-preset-status')).toContainText('saved in this browser');
  await page.reload();
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await select.selectOption(id);
  await page.getByLabel('In (s)', { exact: true }).fill('0.5');
  await page.getByLabel('In (s)', { exact: true }).press('Tab');
  await page.getByLabel('Value', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Set key', exact: true }).click();
  await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
  await expect(page.getByLabel('Flowing displacement 1 Amount', { exact: true })).toHaveValue('61');
  await expect(page.getByLabel('Enable Water reflection 2', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('In (s)', { exact: true })).toHaveValue('0.5');
  await expect(page.locator('#key-count')).toHaveText('1 / 200');
  await page.getByRole('button', { name: 'Rename preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('<b>Moon lake</b>');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  await expect(select.locator('option:checked')).toHaveText('<b>Moon lake</b>');
  await expect(select).toHaveValue(id);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#motion-saved-presets').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/saved-motion-presets-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('#motion-saved-presets').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/saved-motion-presets-mobile.png', fullPage: true });
  expect(
    await page.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(select.locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Apply preset', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Flowing displacement 1 Amount', { exact: true })).toHaveValue('61');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse((await readFile((await (await download).path())!)).toString());
  expect(project.motion.timeline.effects[0].amount).toBe(61);
  expect(project.motion.timeline.effects[1].enabled).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await expect(select.locator('option')).toHaveCount(1);
});

test('custom preset forms cancel, reject duplicate names, and retain input on storage failures', async ({
  page,
}) => {
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  const open = page.getByRole('button', { name: 'Save animation preset', exact: true });
  const input = page.getByLabel('Animation preset name', { exact: true });
  const form = page.locator('#motion-preset-form');
  await open.click();
  await input.fill('First');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await open.click();
  await input.fill(' first ');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#motion-preset-status')).toContainText('already has that name');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form).toBeHidden();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await open.click();
  await input.fill('Second');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#motion-preset-status')).toContainText('unavailable or full');
  await expect(input).toHaveValue('Second');
  await expect(form).toBeVisible();
  await expect(
    page.getByLabel('Your saved animation presets', { exact: true }).locator('option'),
  ).toHaveCount(2);
});

test('saved palette stacks show compatibility and refresh after another tab renames or deletes them', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await page.getByRole('button', { name: /^Chromatic Tide/ }).click();
  await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Tide');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  const second = await context.newPage();
  await second.goto('/');
  await openAdvanced(second);
  await second.getByRole('button', { name: 'Animate image', exact: true }).click();
  await second.getByLabel('Longest side', { exact: true }).selectOption('128');
  const select = second.getByLabel('Your saved animation presets', { exact: true });
  await select.selectOption({ label: 'Tide' });
  await second.getByLabel('Mode', { exact: true }).selectOption('rgb');
  await expect(second.getByRole('button', { name: 'Apply preset', exact: true })).toBeDisabled();
  await expect(second.locator('#motion-preset-compatibility')).toBeVisible();
  await second.getByLabel('Mode', { exact: true }).selectOption('palette');
  await expect(second.getByRole('button', { name: 'Apply preset', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rename preset', exact: true }).click();
  await page.getByLabel('Animation preset name', { exact: true }).fill('Ocean');
  await page
    .locator('#motion-preset-form')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  await expect(select.locator('option:checked')).toHaveText('Ocean');
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(select.locator('option')).toHaveCount(1);
  await expect(second.getByRole('button', { name: 'Apply preset', exact: true })).toBeDisabled();
  await second.close();
});

test('exports selected/all presets and imports them into another browser with duplicate handling and no animation changes', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Animate image', exact: true }).click();
  await page.getByLabel('Longest side', { exact: true }).selectOption('128');
  await expect(page.getByRole('button', { name: 'Export all', exact: true })).toBeDisabled();
  for (const [look, name] of [
    ['Mirror Lake', 'Lake'],
    ['Aftershock', 'Shock'],
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${look}`) }).click();
    await page.getByRole('button', { name: 'Save animation preset', exact: true }).click();
    await page.getByLabel('Animation preset name', { exact: true }).fill(name);
    await page
      .locator('#motion-preset-form')
      .getByRole('button', { name: 'Save', exact: true })
      .click();
  }
  const exportFile = async (name: string) => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    return readFile((await (await download).path())!);
  };
  const single = await exportFile('Export selected');
  expect(JSON.parse(single.toString()).presets.map((p: { name: string }) => p.name)).toEqual([
    'Shock',
  ]);
  const all = await exportFile('Export all');
  expect(JSON.parse(all.toString()).presets).toHaveLength(2);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto(page.url());
    await openAdvanced(other);
    await other.getByRole('button', { name: 'Animate image', exact: true }).click();
    await other.getByLabel('Longest side', { exact: true }).selectOption('128');
    const select = other.getByLabel('Your saved animation presets', { exact: true });
    await expect(select.locator('option')).toHaveCount(1);
    const file = { name: 'shared.json', mimeType: 'application/json', buffer: all };
    await other.locator('#motion-preset-file').setInputFiles(file);
    await expect(other.locator('#motion-preset-status')).toContainText('Imported 2');
    await expect(other.locator('#motion-stack-count')).toHaveText('0 / 8');
    await other.locator('#motion-preset-file').setInputFiles(file);
    await expect(other.locator('#motion-preset-status')).toContainText(
      '2 duplicate names numbered',
    );
    await expect(select.locator('option')).toHaveText([
      'Choose a preset…',
      'Lake',
      'Shock',
      'Lake (2)',
      'Shock (2)',
    ]);
    await other.getByRole('button', { name: 'Apply preset', exact: true }).click();
    await expect(other.getByLabel('Flowing displacement 1 Amount', { exact: true })).toHaveValue(
      '15',
    );
    await other.locator('#motion-preset-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":2}'),
    });
    await expect(other.locator('#motion-preset-status')).toContainText(
      'Invalid animation preset file',
    );
    await expect(select.locator('option')).toHaveCount(5);
    await expect(other.locator('#motion-stack-count')).toHaveText('2 / 8');
    await other.locator('#motion-preset-file').setInputFiles({
      name: 'huge.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(256 * 1024 + 1, 32),
    });
    await expect(other.locator('#motion-preset-status')).toContainText('256 KB');
    await expect(select.locator('option')).toHaveCount(5);
    expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    await other.setViewportSize({ width: 320, height: 844 });
    await select.scrollIntoViewIfNeeded();
    await other.screenshot({
      path: 'test-results/shared-motion-presets-mobile.png',
      fullPage: true,
    });
    expect(
      await other.locator('#motion-section').evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
    await other.reload();
    await other.getByRole('button', { name: 'Animate image', exact: true }).click();
    await expect(select.locator('option')).toHaveCount(5);
  } finally {
    await otherContext.close();
  }
});
