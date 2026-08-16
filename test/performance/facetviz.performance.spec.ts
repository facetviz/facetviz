import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { PerformanceMetrics, PerformanceScenario } from './performance-fixtures.js';

const budgets: Record<PerformanceScenario, {
  renderMs: number;
  updateMs?: number;
  sortMs?: number;
  filterMs?: number;
  pivotMs?: number;
}> = {
  svg: { renderMs: 500 },
  'boost-scatter': { renderMs: 750 },
  'boost-update': { renderMs: 500, updateMs: 500 },
  'stream-batch': { renderMs: 500, updateMs: 750 },
  'table-page': { renderMs: 500, sortMs: 750, filterMs: 750 },
  'pivot-table': { renderMs: 1_500, pivotMs: 750 },
  'table-cell-charts': { renderMs: 750 },
};

async function runScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: PerformanceScenario,
): Promise<PerformanceMetrics> {
  await page.goto(`/test/performance/fixtures.html?scenario=${scenario}`);
  await page.waitForSelector('body[data-ready="true"]');
  const raw = await page.locator('#metrics').textContent();
  const metrics = JSON.parse(raw ?? '{}') as PerformanceMetrics;
  await testInfo.attach(`${scenario}-metrics`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  console.log(`[performance] ${scenario}: ${JSON.stringify(metrics)}`);
  return metrics;
}

test('1,200-point SVG rendering stays within its budget', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'svg');
  expect(metrics.points).toBe(1_200);
  expect(metrics.renderMs).toBeLessThan(budgets.svg.renderMs);
  expect(metrics.canvases).toBe(0);
  expect(metrics.pointElements).toBe(1_200);
  expect(metrics.accessiblePoints).toBe(1_200);
  expect(metrics.domNodes).toBeLessThan(1_500);
});

test('100k scatter uses the bounded canvas boost path', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'boost-scatter');
  expect(metrics.points).toBe(100_000);
  expect(metrics.renderMs).toBeLessThan(budgets['boost-scatter'].renderMs);
  expect(metrics.canvases).toBe(1);
  expect(metrics.pointElements).toBe(0);
  expect(metrics.svgElements).toBeLessThan(150);
  expect(metrics.domNodes).toBeLessThan(200);
});

test('100k live update stays on the boost path and within budget', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'boost-update');
  expect(metrics.points).toBe(100_000);
  expect(metrics.renderMs).toBeLessThan(budgets['boost-update'].renderMs);
  expect(metrics.updateMs).toBeLessThan(budgets['boost-update'].updateMs!);
  expect(metrics.canvases).toBe(1);
  expect(metrics.pointElements).toBe(0);
  expect(metrics.svgElements).toBeLessThan(150);
  expect(metrics.domNodes).toBeLessThan(200);
});

test('bounded batched streaming coalesces renders and memory', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'stream-batch');
  expect(metrics.points).toBe(1_000);
  expect(metrics.renderCount).toBe(20);
  expect(metrics.updateMs).toBeLessThan(budgets['stream-batch'].updateMs!);
  expect(metrics.canvases).toBe(0);
  expect(metrics.domNodes).toBeLessThan(1_500);
});

test('100k-row FacetTable keeps paging, sorting, and filtering bounded', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'table-page');
  expect(metrics.sourceRows).toBe(100_000);
  expect(metrics.renderMs).toBeLessThan(budgets['table-page'].renderMs);
  expect(metrics.sortMs).toBeLessThan(budgets['table-page'].sortMs!);
  expect(metrics.filterMs).toBeLessThan(budgets['table-page'].filterMs!);
  expect(metrics.renderedRows).toBe(25);
  expect(metrics.columns).toBe(5);
  expect(metrics.domNodes).toBeLessThan(250);
});

test('50k-record pivot transforms and renders a bounded page', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'pivot-table');
  expect(metrics.sourceRows).toBe(50_000);
  expect(metrics.points).toBe(511);
  expect(metrics.pivotMs).toBeLessThan(budgets['pivot-table'].pivotMs!);
  expect(metrics.renderMs).toBeLessThan(budgets['pivot-table'].renderMs);
  expect(metrics.renderedRows).toBe(25);
  expect(metrics.columns).toBe(164);
  expect(metrics.domNodes).toBeLessThan(5_000);
});

test('25 non-sparkline table cell charts stay within their DOM budget', async ({ page }, testInfo) => {
  const metrics = await runScenario(page, testInfo, 'table-cell-charts');
  expect(metrics.sourceRows).toBe(25);
  expect(metrics.points).toBe(500);
  expect(metrics.renderMs).toBeLessThan(budgets['table-cell-charts'].renderMs);
  expect(metrics.renderedRows).toBe(25);
  expect(metrics.columns).toBe(3);
  expect(metrics.charts).toBe(25);
  expect(metrics.domNodes).toBeLessThan(1_200);
});
