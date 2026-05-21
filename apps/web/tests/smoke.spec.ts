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
  test('overview dashboard renders KPIs + charts', async ({ page }, testInfo) => {
    await page.goto('/');
    // The shell defaults to overview now; nav-overview should be visible and
    // clicking it lands on the dashboard.
    await page.getByTestId('nav-overview').click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('overview-dashboard')).toBeVisible();
    await expect(page.getByTestId('overview-kpis')).toBeVisible();
    await expect(page.getByTestId('overview-source-coverage')).toBeVisible();
    await expect(page.getByTestId('overview-health-distribution')).toBeVisible();
    await expect(page.getByTestId('overview-sync-freshness')).toBeVisible();
    // Source coverage rows reflect the seeded sources (Okta-demo + Defender-demo).
    const coverageRows = await page.getByTestId('overview-source-row').count();
    expect(coverageRows).toBeGreaterThan(0);

    await page.screenshot({
      path: testInfo.outputPath('overview-view.png'),
      fullPage: true,
    });
  });

  test('overview gap link drops onto a filtered report', async ({ page }) => {
    await page.goto('/#/overview');
    await page.waitForLoadState('networkidle');
    // Either the gap card shows links (seeded data has gaps) or it shows the
    // empty state. We only assert the link behaviour when the seed produced
    // gaps — otherwise the test is a no-op rather than a false failure.
    const list = page.getByTestId('overview-gap-list');
    if (await list.isVisible()) {
      const firstLink = list.locator('a').first();
      await firstLink.click();
      await expect(page).toHaveURL(/#\/devices\?.*missingFrom=/);
      await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    }
  });

  test('devices view renders with rows', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByTestId('nav-devices').click();
    await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    await expect(page.getByTestId('devices-search')).toBeVisible();
    await expect(page.getByTestId('devices-filterbar')).toBeVisible();

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
    await page.getByTestId('nav-overview').click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
    await page.getByTestId('nav-devices').click();
    await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    await page.getByTestId('nav-identities').click();
    await expect(page.getByRole('heading', { name: 'Identities', level: 2 })).toBeVisible();
    await page.getByTestId('nav-sources').click();
    await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeVisible();
  });

  test('devices filter "Has gaps" syncs to URL and narrows the table', async ({ page }) => {
    await page.goto('/#/devices');
    await page.waitForLoadState('networkidle');
    const beforeRows = await page.getByTestId('device-row').count();

    await page.getByTestId('filter-hasgaps').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/hasGaps=true/);

    const afterRows = await page.getByTestId('device-row').count();
    // The seed produces a mix; filtering should yield at most the original
    // count, and the active count should be visible in the clear pill.
    expect(afterRows).toBeLessThanOrEqual(beforeRows);
    await expect(page.getByTestId('filter-clear')).toBeVisible();

    // Hitting clear removes the filter and the URL flag.
    await page.getByTestId('filter-clear').click();
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/hasGaps=true/);
  });

  test('devices URL filter loads on direct navigation', async ({ page }) => {
    await page.goto('/#/devices?hasGaps=true');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Devices', level: 2 })).toBeVisible();
    // The active filter should be reflected in the toggle's aria-pressed state.
    await expect(page.getByTestId('filter-hasgaps')).toHaveAttribute('aria-pressed', 'true');
  });

  test('devices sort cycles direction on header click', async ({ page }) => {
    await page.goto('/#/devices');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('sort-hostname').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/sort=hostname/);
    await page.getByTestId('sort-hostname').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/dir=desc/);
  });

  test('devices CSV export triggers a download', async ({ page }) => {
    await page.goto('/#/devices');
    await page.waitForLoadState('networkidle');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('devices-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^corastate-devices-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
