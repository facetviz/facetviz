import { expect, test } from '@playwright/test';
import type { ChartType } from '../../src/index.js';

const chartTypes: ChartType[] = [
  'bar', 'column', 'arearange', 'areasplinerange', 'line', 'spline', 'step',
  'area', 'areaspline', 'pie', 'donut', 'scatter', 'jitter', 'boxplot',
  'dumbbell', 'lollipop', 'slope', 'butterfly', 'columnrange', 'radialbar',
  'heatmap', 'bullet', 'candlestick', 'gauge', 'waterfall', 'histogram',
  'timeline', 'funnel', 'treegraph', 'bubble', 'radar', 'sunburst', 'sankey',
  'calendar', 'gantt', 'marimekko', 'errorbar', 'sparkline',
];

async function waitForFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('body[data-ready="true"]');
  await expect(page.locator('.fixture-card')).toBeVisible();
}

test.describe('all registered chart types', () => {
  for (const type of chartTypes) {
    test(type, async ({ page }) => {
      await page.goto(`/test/visual/fixtures.html?type=${type}`);
      await waitForFixture(page);
      await expect(page.locator(`[data-fixture="${type}"]`)).toHaveScreenshot(`${type}.png`);
    });
  }
});

test.describe('themes', () => {
  for (const theme of ['light', 'dark', 'high-contrast', 'pastel']) {
    test(theme, async ({ page }) => {
      await page.goto(`/test/visual/fixtures.html?theme=${theme}`);
      await waitForFixture(page);
      await expect(page.locator(`[data-fixture="theme-${theme}"]`)).toHaveScreenshot(`theme-${theme}.png`);
    });
  }
});

test('responsive compact layout', async ({ page }) => {
  await page.goto('/test/visual/fixtures.html?mode=responsive');
  await waitForFixture(page);
  await expect(page.locator('[data-fixture="responsive"]')).toHaveScreenshot('responsive-compact.png');
});

test('polar layout, titles, and annotation', async ({ page }) => {
  await page.goto('/test/visual/fixtures.html?mode=layout-features');
  await waitForFixture(page);
  await expect(page.locator('[data-fixture="layout-features"]')).toHaveScreenshot(
    'layout-features.png',
  );
});

test('data update before and after', async ({ page }) => {
  await page.goto('/test/visual/fixtures.html?mode=update');
  await waitForFixture(page);
  const fixture = page.locator('[data-fixture="update"]');
  await expect(fixture).toHaveScreenshot('update-before.png');
  await page.locator('#apply-update').click({ force: true });
  await expect(page.locator('body')).toHaveAttribute('data-updated', 'true');
  await expect(fixture).toHaveScreenshot('update-after.png');
});

test('keyboard point navigation exposes focus and tooltip state', async ({ page }) => {
  await page.goto('/test/visual/fixtures.html?type=column');
  await waitForFixture(page);
  await expect(page.locator('svg.facet-root')).toHaveAttribute('role', 'figure');
  const first = page.getByRole('img', { name: 'North, Jan: 5' });
  const second = page.getByRole('img', { name: 'North, Feb: 3' });
  await first.focus();
  await first.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(page.locator('.facet-tooltip')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-fixture="column"]')).toHaveScreenshot('keyboard-point-focus.png');
});
