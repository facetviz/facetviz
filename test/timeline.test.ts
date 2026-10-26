import { describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 700, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } } as ChartOptions);
  return el;
}

// Quarters over three years, as period starts.
const quarters = [2023, 2024, 2025].flatMap((y) => [0, 3, 6, 9].map((m) => new Date(y, m, 1).getTime()));

describe('a timeline', () => {
  it('labels years along a datetime axis and fills each quarter with its column', () => {
    const data = quarters.map((x, i) => ({ x, y: i + 1, seg: 'A' }));
    const el = render({ xAxis: { type: 'datetime' }, series: [{ type: 'column', name: 'S', data, fillGap: true }], trellis: { columns: 'seg' } });
    const labels = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"] text')].map((t) => t.textContent);
    expect(labels.every((l) => /^\d{4}$/.test(l ?? ''))).toBe(true);
    const rects = [...el.querySelectorAll('rect.facet-point')];
    expect(rects).toHaveLength(12);
    // Neighbouring columns almost touch: each nearly as wide as the step between them.
    const xs = rects.map((r) => Number(r.getAttribute('x'))).sort((a, b) => a - b);
    const step = xs[1] - xs[0];
    expect(Number(rects[0].getAttribute('width'))).toBeGreaterThan(step * 0.8);
  });

  it('works on a chart without panels too', () => {
    const data = quarters.map((x, i) => ({ x, y: i + 1 }));
    const el = render({ xAxis: { type: 'datetime' }, series: [{ type: 'column', name: 'S', data, fillGap: true }] });
    const labels = [...el.querySelectorAll('[data-fv-id="xAxis[0]"] text')].map((t) => t.textContent);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.every((l) => /^\d{4}$/.test(l ?? ''))).toBe(true);
    expect(el.querySelectorAll('rect.facet-point')).toHaveLength(12);
  });
});
