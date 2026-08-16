import { FacetTable, FacetViz, pivotData, type PointInput } from '../../src/index.ts';

export type PerformanceScenario =
  | 'svg'
  | 'boost-scatter'
  | 'boost-update'
  | 'stream-batch'
  | 'table-page'
  | 'pivot-table'
  | 'table-cell-charts';

export interface PerformanceMetrics {
  scenario: PerformanceScenario;
  points: number;
  renderMs: number;
  updateMs?: number;
  sortMs?: number;
  filterMs?: number;
  pivotMs?: number;
  renderCount?: number;
  sourceRows?: number;
  renderedRows?: number;
  columns?: number;
  charts?: number;
  domNodes: number;
  svgElements: number;
  pointElements: number;
  accessiblePoints: number;
  canvases: number;
}

const params = new URLSearchParams(location.search);
const scenario = (params.get('scenario') ?? 'svg') as PerformanceScenario;
const container = document.querySelector<HTMLElement>('#chart')!;
const output = document.querySelector<HTMLOutputElement>('#metrics')!;

const scatterData = (count: number): PointInput[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    y: Math.sin(i / 31) * 35 + Math.cos(i / 113) * 12 + 50,
  }));

// Warm the module/render path before measuring. The guardrails are intended to
// catch chart regressions, not one-time Vite compilation or browser startup.
const warmup = document.createElement('div');
warmup.style.width = '200px';
warmup.style.height = '100px';
document.body.append(warmup);
const warmupChart = new FacetViz(warmup, {
  chart: { type: 'line', width: 200, height: 100, animation: false, reflow: false },
  accessibility: { enabled: false },
  series: [{ data: [1, 2, 3] }],
});
warmupChart.destroy();
warmup.remove();

let chart: FacetViz;
let points = 0;
let renderMs = 0;
let updateMs: number | undefined;
let sortMs: number | undefined;
let filterMs: number | undefined;
let pivotMs: number | undefined;
let renderCount: number | undefined;
let sourceRows: number | undefined;
let renderedRows: number | undefined;
let columns: number | undefined;
let charts: number | undefined;

if (scenario === 'svg') {
  const data = scatterData(1_200);
  points = data.length;
  const start = performance.now();
  chart = new FacetViz(container, {
    chart: { type: 'scatter', width: 960, height: 520, animation: false, reflow: false, boost: false },
    title: { text: '1,200 SVG points' },
    series: [{ name: 'Samples', data, marker: { radius: 2 } }],
  });
  renderMs = performance.now() - start;
} else if (scenario === 'boost-scatter') {
  const data = scatterData(100_000);
  points = data.length;
  const start = performance.now();
  chart = new FacetViz(container, {
    chart: { type: 'scatter', width: 960, height: 520, animation: false, reflow: false, boost: true },
    title: { text: '100,000 boosted scatter points' },
    series: [{ name: 'Samples', data, marker: { radius: 1.5 } }],
  });
  renderMs = performance.now() - start;
} else if (scenario === 'boost-update') {
  const initial = scatterData(10_000);
  const next = scatterData(100_000);
  points = next.length;
  const start = performance.now();
  chart = new FacetViz(container, {
    chart: { type: 'line', width: 960, height: 520, animation: false, reflow: false, boost: true },
    title: { text: '100,000-point live update' },
    series: [{ name: 'Signal', data: initial }],
  });
  renderMs = performance.now() - start;
  const updateStart = performance.now();
  chart.setData(0, next);
  updateMs = performance.now() - updateStart;
} else if (scenario === 'stream-batch') {
  chart = new FacetViz(container, {
    chart: { type: 'line', width: 960, height: 520, animation: false, reflow: false, boost: false },
    title: { text: 'Bounded batched stream' },
    series: [{
      name: 'Signal',
      data: [],
      marker: { enabled: false },
    }],
  });
  renderMs = 0;
  renderCount = 0;
  chart.on('render', () => { renderCount! += 1; });
  const updateStart = performance.now();
  for (let batchIndex = 0; batchIndex < 20; batchIndex += 1) {
    chart.batchUpdate((batch) => {
      for (let chunk = 0; chunk < 10; chunk += 1) {
        const start = (batchIndex * 10 + chunk) * 20;
        batch.appendData(0, Array.from({ length: 20 }, (_, offset) => ({
          x: start + offset,
          y: Math.sin((start + offset) / 31) * 20 + 50,
        })), { maxPoints: 1_000 });
      }
    });
  }
  updateMs = performance.now() - updateStart;
  points = chart.series[0].points.length;
} else if (scenario === 'table-page') {
  const rows = Array.from({ length: 100_000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    region: `R${i % 20}`,
    revenue: (i * 7_919) % 100_000,
    growth: i % 17,
  }));
  sourceRows = rows.length;
  const start = performance.now();
  const table = new FacetTable(container, {
    rows,
    columns: [
      { key: 'id', header: 'ID', sortable: true },
      { key: 'name', header: 'Name', filterable: true },
      { key: 'region', header: 'Region', filterable: true },
      { key: 'revenue', header: 'Revenue', sortable: true },
      { key: 'growth', header: 'Growth' },
    ],
    pagination: { pageSize: 25 },
  });
  renderMs = performance.now() - start;
  const sortStart = performance.now();
  table.sortBy('revenue', 'desc');
  sortMs = performance.now() - sortStart;
  const filterStart = performance.now();
  table.setFilter('name', 'Item 99');
  filterMs = performance.now() - filterStart;
  points = rows.length;
  renderedRows = container.querySelectorAll('tbody tr').length;
  columns = container.querySelectorAll('tbody tr:first-child td').length;
} else if (scenario === 'pivot-table') {
  const data = Array.from({ length: 50_000 }, (_, i) => ({
    region: `R${i % 10}`,
    product: `P${Math.floor(i / 10) % 50}`,
    city: `C${Math.floor(i / 500) % 20}`,
    quarter: `Q${Math.floor(i / 10_000) % 4 + 1}`,
    revenue: i % 1_000,
    units: i % 37,
  }));
  sourceRows = data.length;
  const pivotStart = performance.now();
  const result = pivotData(data, {
    rows: ['region', 'product'],
    columns: ['city', 'quarter'],
    measures: [
      { key: 'revenue', aggregate: 'sum' },
      { key: 'units', aggregate: 'average' },
    ],
    subtotals: true,
    grandTotals: true,
  });
  pivotMs = performance.now() - pivotStart;
  const start = performance.now();
  new FacetTable(container, {
    ...result,
    pagination: { pageSize: 25 },
  });
  renderMs = performance.now() - start;
  points = result.rows.length;
  renderedRows = container.querySelectorAll('tbody tr').length;
  columns = container.querySelectorAll('tbody tr:first-child td').length;
} else if (scenario === 'table-cell-charts') {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    trend: Array.from({ length: 20 }, (_value, j) =>
      Math.sin(j / 3) * 10 + i
    ),
  }));
  sourceRows = rows.length;
  const start = performance.now();
  const table = new FacetTable(container, {
    rows,
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      {
        key: 'trend',
        header: 'Trend',
        chart: { type: 'line', height: 44, minWidth: 120 },
      },
    ],
  });
  renderMs = performance.now() - start;
  points = rows.length * rows[0].trend.length;
  renderedRows = container.querySelectorAll('tbody tr').length;
  columns = container.querySelectorAll('tbody tr:first-child td').length;
  charts = table.charts.length;
} else {
  throw new Error(`Unknown performance scenario: ${scenario}`);
}

const metrics: PerformanceMetrics = {
  scenario,
  points,
  renderMs: Math.round(renderMs * 100) / 100,
  updateMs: updateMs === undefined ? undefined : Math.round(updateMs * 100) / 100,
  sortMs: sortMs === undefined ? undefined : Math.round(sortMs * 100) / 100,
  filterMs: filterMs === undefined ? undefined : Math.round(filterMs * 100) / 100,
  pivotMs: pivotMs === undefined ? undefined : Math.round(pivotMs * 100) / 100,
  renderCount,
  sourceRows,
  renderedRows,
  columns,
  charts,
  domNodes: container.querySelectorAll('*').length,
  svgElements: container.querySelectorAll('svg *').length,
  pointElements: container.querySelectorAll('.facet-point, .facet-point-hit').length,
  accessiblePoints: container.querySelectorAll('.facet-a11y-point').length,
  canvases: container.querySelectorAll('canvas').length,
};

output.value = JSON.stringify(metrics, null, 2);
document.body.dataset.ready = 'true';
