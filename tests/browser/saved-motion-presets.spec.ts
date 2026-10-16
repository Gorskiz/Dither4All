import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('custom animation presets save, survive reload, apply, rename and delete without changing the current animation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
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
