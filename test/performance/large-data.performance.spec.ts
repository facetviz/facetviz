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
  { name: '5,000 columns', query: 'type=column&categories=5000', points: 5_000, budget: { chromium: 300, webkit: 500 }, maxNodes: 6_000 },
  { name: '5,000 bars', query: 'type=bar&categories=5000', points: 5_000, budget: { chromium: 300, webkit: 600 }, maxNodes: 11_000 },
  { name: 'a line over 50,000 categories', query: 'type=line&categories=50000', points: 50_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  { name: '12 lines over 5,000 categories', query: 'type=line&categories=5000&series=12', points: 60_000, budget: { chromium: 300, webkit: 400 }, maxNodes: 300 },
  // Columns and stacked areas still draw one SVG element per point; the
  // canvas path for them should bring these under 1,000 ms in WebKit.
  { name: '60,000 columns (5,000 x 12)', query: 'type=column&categories=5000&series=12', points: 60_000, budget: { chromium: 2_000, webkit: 5_000 }, maxNodes: 61_000 },
  { name: 'a 60,000-point stacked area (5,000 x 12)', query: 'type=area&categories=5000&series=12&stacked=1', points: 60_000, budget: { chromium: 2_000, webkit: 5_000 }, maxNodes: 61_000 },
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
