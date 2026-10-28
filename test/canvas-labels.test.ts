import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { CanvasObjectEvent, ChartOptions } from '../src/index.js';

function render(options: ChartOptions): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } });
  return el;
}

describe('category labels and legend items as canvas parts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports a right-clicked category label and legend item with their values', () => {
    const got: CanvasObjectEvent[] = [];
    const el = render({
      chart: { type: 'column', events: { canvasContextMenu: (ev) => got.push(ev) } },
      xAxis: { categories: ['East', 'West'] },
      legend: { enabled: true },
      series: [{ name: 'Toys', data: [1, 2] }, { name: 'Tech', data: [3, 4] }],
    });
    el.querySelector('[data-fv-kind="axis"][data-fv-id="xAxis[0]"] .facet-axis-label[data-fv-path="West"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    el.querySelector('.facet-legend-item[data-fv-path="Tech"] text')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(got.map((e) => [e.kind, e.id, e.path])).toEqual([
      ['axis', 'xAxis[0]', ['West']],
      ['legend', 'legend', ['Tech']],
    ]);
  });

  it('leaves value axes\' labels unmarked', () => {
    const el = render({ chart: { type: 'column' }, xAxis: { categories: ['A'] }, series: [{ name: 'S', data: [5] }] });
    expect(el.querySelectorAll('[data-fv-id="yAxis[0]"] .facet-axis-label').length).toBe(0);
  });
});
