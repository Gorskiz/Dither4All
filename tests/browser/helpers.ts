import type { Page } from '@playwright/test';
export async function openAdvanced(page: Page) {
  const toggle = page.getByRole('button', { name: 'Show advanced controls', exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
