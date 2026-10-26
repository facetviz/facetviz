import { describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } } as ChartOptions);
  return el;
}

describe('category grid lines between categories', () => {
  it('draws a line between each pair of categories, not through them', () => {
    const series = [{ type: 'column' as const, name: 'S', data: [3, 5, 2] }];
    const lines = (el: HTMLElement) => [...el.querySelectorAll('[data-fv-id="xAxis[0]"] line.facet-gridline')].map((l) => Number(l.getAttribute('x1')));
    const centres = lines(render({ xAxis: { categories: ['A', 'B', 'C'], gridLineWidth: 1 }, series }));
    const between = lines(render({ xAxis: { categories: ['A', 'B', 'C'], gridLineWidth: 1, gridLinePlacement: 'between' }, series }));
    expect(centres).toHaveLength(3);
    expect(between).toHaveLength(2);
    // Halfway between neighbouring centres.
    expect(between[0]).toBeCloseTo((centres[0] + centres[1]) / 2, 5);
    expect(between[1]).toBeCloseTo((centres[1] + centres[2]) / 2, 5);
  });
});
