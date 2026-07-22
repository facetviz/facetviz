import { FacetViz, type PointInput } from '../../src/index.ts';

export type PerformanceScenario = 'svg' | 'boost-scatter' | 'boost-update' | 'stream-batch';

export interface PerformanceMetrics {
  scenario: PerformanceScenario;
  points: number;
  renderMs: number;
  updateMs?: number;
  renderCount?: number;
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
let renderCount: number | undefined;

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
} else {
  throw new Error(`Unknown performance scenario: ${scenario}`);
}

const metrics: PerformanceMetrics = {
  scenario,
  points,
  renderMs: Math.round(renderMs * 100) / 100,
  updateMs: updateMs === undefined ? undefined : Math.round(updateMs * 100) / 100,
  renderCount,
  domNodes: container.querySelectorAll('*').length,
  svgElements: container.querySelectorAll('svg *').length,
  pointElements: container.querySelectorAll('.facet-point, .facet-point-hit').length,
  accessiblePoints: container.querySelectorAll('.facet-a11y-point').length,
  canvases: container.querySelectorAll('canvas').length,
};

output.value = JSON.stringify(metrics, null, 2);
document.body.dataset.ready = 'true';
