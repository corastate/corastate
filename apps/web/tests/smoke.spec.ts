/**
 * Smoke tests for the three product views + the diagnostic health view.
 *
 * The tests assume the seed has been applied (the README walkthrough does
 * this before `pnpm test:ui`). Each test:
 *   - Navigates to a view via the nav button.
 *   - Asserts the page header is present.
 *   - Asserts that the data surface renders (table populated, cards present,
 *     or the explicit empty-state — the empty case shouldn't fire when the
 *     seed has run, but the assertion captures the contract either way).
 *   - Captures a screenshot to the test-output directory for visual review.
 */

import { expect, test } from '@playwright/test';

test.describe('Corastate web UI smoke', () => {
  test('devices view renders with rows', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByTestId('nav-devices').click();
    await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    await expect(page.getByTestId('devices-search')).toBeVisible();

    // Wait for the network round-trip + table render. If the seed has run,
    // the table fills; otherwise the empty state shows. Either is a valid
    // contract — but a populated demo install should land in the table.
    await page.waitForLoadState('networkidle');
    const table = page.getByTestId('devices-table');
    const empty = page.getByTestId('devices-empty');
    await expect(table.or(empty)).toBeVisible();
    if (await table.isVisible()) {
      const rowCount = await page.getByTestId('device-row').count();
      expect(rowCount).toBeGreaterThan(0);
    }
    await page.screenshot({
      path: testInfo.outputPath('devices-view.png'),
      fullPage: true,
    });
  });

  test('identities view renders with rows', async ({ page }, testInfo) => {
    await page.goto('/#/identities');
    await expect(page.getByRole('heading', { name: 'Identities', level: 2 })).toBeVisible();
    await expect(page.getByTestId('identities-search')).toBeVisible();

    await page.waitForLoadState('networkidle');
    const table = page.getByTestId('identities-table');
    const empty = page.getByTestId('identities-empty');
    await expect(table.or(empty)).toBeVisible();
    if (await table.isVisible()) {
      const rowCount = await page.getByTestId('identity-row').count();
      expect(rowCount).toBeGreaterThan(0);
    }
    await page.screenshot({
      path: testInfo.outputPath('identities-view.png'),
      fullPage: true,
    });
  });

  test('sources view renders cards', async ({ page }, testInfo) => {
    await page.goto('/#/sources');
    await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const grid = page.getByTestId('sources-grid');
    const empty = page.getByTestId('sources-empty');
    await expect(grid.or(empty)).toBeVisible();
    if (await grid.isVisible()) {
      const cardCount = await page.getByTestId('source-card').count();
      expect(cardCount).toBeGreaterThan(0);
    }
    await page.screenshot({
      path: testInfo.outputPath('sources-view.png'),
      fullPage: true,
    });
  });

  test('health view shows backend status', async ({ page }, testInfo) => {
    await page.goto('/#/health');
    await expect(page.getByRole('heading', { name: 'System health', level: 2 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('health-card')).toBeVisible();
    await expect(page.getByText('ok', { exact: false }).first()).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('health-view.png'),
      fullPage: true,
    });
  });

  test('nav switches between views', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-devices').click();
    await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    await page.getByTestId('nav-identities').click();
    await expect(page.getByRole('heading', { name: 'Identities', level: 2 })).toBeVisible();
    await page.getByTestId('nav-sources').click();
    await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeVisible();
  });
});
