import { expect, test } from '@playwright/test';
import type { PerformanceMetrics } from './performance-fixtures.js';

// Charts as big as the app can ask for: 500 x values x 12 colors by default,
// up to 50,000 x values (and 1,000 colors) with every value shown. Budgets are
// render times in ms per browser, a few times what they take now, so a slow
// machine passes and a regression back to seconds fails. WebKit is the
// desktop app's engine. Element counts catch a regression without timing noise.

interface LargeCase {
  name: string;
  query: string;
  points: number;
  budget: { chromium: number; webkit: number };
  /** Most elements the chart may put on the page. */
  maxNodes: number;
}

const cases: LargeCase[] = [
  { name: 'columns at the default limit (500 x 12)', query: 'type=column&categories=500&series=12', points: 6_000, budget: { chromium: 300, webkit: 600 }, maxNodes: 7_000 },
  { name: '5,000 columns', query: 'type=column&categories=5000', points: 5_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '5,000 bars', query: 'type=bar&categories=5000', points: 5_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: 'a line over 50,000 categories', query: 'type=line&categories=50000', points: 50_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '12 lines over 5,000 categories', query: 'type=line&categories=5000&series=12', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '60,000 columns (5,000 x 12)', query: 'type=column&categories=5000&series=12', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '60,000 stacked columns (5,000 x 12)', query: 'type=column&categories=5000&series=12&stacked=1', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '50,000 bars', query: 'type=bar&categories=50000', points: 50_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  // Bars thinner than a pixel are merged per pixel: 200,000 (the most the
  // app sends) cost about what a few thousand do.
  // Charts in several plots: a canvas per pane or panel.
  { name: '60,000 columns in 3 panes (5,000 x 12)', query: 'type=column&categories=5000&series=12&panes=3', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 400 },
  { name: '60,000 stacked columns in 2 panes', query: 'type=column&categories=5000&series=12&panes=2&stacked=1', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 400 },
  { name: '60,000 columns in 6 small multiples (2,500 x 4 x 6)', query: 'type=column&categories=2500&series=4&panels=6', points: 60_000, budget: { chromium: 400, webkit: 500 }, maxNodes: 600 },
  { name: '200,000 columns (50,000 x 4)', query: 'type=column&categories=50000&series=4', points: 200_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: 'a 60,000-point stacked area (5,000 x 12)', query: 'type=area&categories=5000&series=12&stacked=1', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
];

for (const c of cases) {
  test(`${c.name} renders within budget`, async ({ page, browserName }, testInfo) => {
    await page.goto(`/test/performance/fixtures.html?scenario=large&${c.query}`);
    await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
    const metrics = JSON.parse((await page.locator('#metrics').textContent()) ?? '{}') as PerformanceMetrics;
    await testInfo.attach(`${c.query}-metrics`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    console.log(`[performance] ${browserName} ${metrics.label}: ${metrics.renderMs} ms, ${metrics.domNodes} nodes`);
    expect(metrics.points).toBe(c.points);
    expect(metrics.renderMs).toBeLessThan(c.budget[browserName as 'chromium' | 'webkit']);
    expect(metrics.domNodes).toBeLessThan(c.maxNodes);
  });
}

test('a column drawn on the canvas shows its tooltip on hover', async ({ page }) => {
  await page.goto('/test/performance/fixtures.html?scenario=large&type=column&categories=5000');
  await page.waitForSelector('body[data-ready="true"]');
  const canvas = page.locator('#chart canvas');
  await expect(canvas).toHaveCount(1);
  // Category 79 is near the top of the sine, so the bars around it run
  // from the baseline most of the way up. Five categories share a pixel
  // here, so any one near it may answer.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + ((79 + 0.5) / 5000) * box.width, box.y + box.height - 20);
  await expect(page.locator('.facet-tooltip')).toBeVisible();
  await expect(page.locator('.facet-tooltip')).toContainText(/Category (6\d|7\d|8\d|9\d)\b/);
});

test('a column in a lower pane, drawn on its canvas, shows its tooltip on hover', async ({ page }) => {
  await page.goto('/test/performance/fixtures.html?scenario=large&type=column&categories=5000&series=2&panes=2');
  await page.waitForSelector('body[data-ready="true"]');
  const canvases = page.locator('#chart canvas');
  await expect(canvases).toHaveCount(2);
  // The second pane holds series 1, whose sine peaks near category 0.
  const box = (await canvases.nth(1).boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + box.height - 10);
  await expect(page.locator('.facet-tooltip')).toBeVisible();
  await expect(page.locator('.facet-tooltip')).toContainText('Series 1');
});
