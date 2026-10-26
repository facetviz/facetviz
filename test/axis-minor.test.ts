import { describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } } as ChartOptions);
  return el;
}

const series = [{ type: 'column' as const, name: 'S', data: [3, 5, 2] }];

describe('minor ticks and grid lines', () => {
  it('draws short tick marks at the minor intervals, with or without minor grid lines', () => {
    const ticks = (el: HTMLElement) => [...el.querySelectorAll('[data-fv-id="yAxis[0]"] line:not(.facet-gridline):not(.facet-minor-gridline)')];
    const plain = ticks(render({ xAxis: { categories: ['A', 'B', 'C'] }, yAxis: {}, series })).length;
    const el = render({ xAxis: { categories: ['A', 'B', 'C'] }, yAxis: { minorTickInterval: 'auto', minorTicks: true }, series });
    expect(ticks(el).length).toBeGreaterThan(plain);
    expect(el.querySelectorAll('.facet-minor-gridline').length).toBeGreaterThan(0);
    const noGrid = render({ xAxis: { categories: ['A', 'B', 'C'] }, yAxis: { minorTickInterval: 'auto', minorTicks: true, minorGridLineWidth: 0 }, series });
    expect(noGrid.querySelectorAll('.facet-minor-gridline').length).toBe(0);
    expect(ticks(noGrid).length).toBeGreaterThan(plain);
  });

  it('keeps grid lines, minor grid lines and plot lines in panels without labels', () => {
    const data = ['R1', 'R2'].flatMap((reg) => ['A', 'B'].map((x, i) => ({ x, y: i + 1, reg, seg: 'P' })));
    const el = render({
      xAxis: { categories: ['A', 'B'] },
      yAxis: { minorTickInterval: 'auto', gridLineColor: '#123456', plotLines: [{ value: 1, color: '#999', width: 1, dashStyle: '2 3' }] },
      series: [{ type: 'column', name: 'S', data }],
      trellis: { rows: 'reg', columns: 'seg' },
    });
    for (const pane of ['reg=R1#seg=P', 'reg=R2#seg=P']) {
      const inPane = (sel: string) => el.querySelectorAll(`[data-fv-id="yAxis[0]"][data-fv-instance="${pane}"] ${sel}, ${sel}[data-fv-id="yAxis[0]"][data-fv-instance="${pane}"]`).length;
      expect(inPane('.facet-minor-gridline')).toBeGreaterThan(0);
      expect([...el.querySelectorAll(`line.facet-gridline[data-fv-id="yAxis[0]"][data-fv-instance="${pane}"]`)].every((l) => l.getAttribute('stroke') === '#123456')).toBe(true);
    }
    expect([...el.querySelectorAll('line, path')].filter((n) => n.getAttribute('stroke-dasharray') === '2 3').length).toBe(2);
  });

  it('draws a dotted zero line when the axis runs through zero, in every panel', () => {
    const zeroLines = (el: HTMLElement) => el.querySelectorAll('line.facet-zero-line').length;
    expect(zeroLines(render({ xAxis: { categories: ['A', 'B'] }, yAxis: { zeroLine: true }, series: [{ type: 'column', name: 'S', data: [3, 5] }] }))).toBe(0);
    expect(zeroLines(render({ xAxis: { categories: ['A', 'B'] }, yAxis: { zeroLine: true }, series: [{ type: 'column', name: 'S', data: [-3, 5] }] }))).toBe(1);
    const data = ['R1', 'R2'].flatMap((reg) => ['A', 'B'].map((x, i) => ({ x, y: i ? 2 : -1, reg })));
    expect(zeroLines(render({ xAxis: { categories: ['A', 'B'] }, yAxis: { zeroLine: true }, series: [{ type: 'column', name: 'S', data }], trellis: { rows: 'reg' } }))).toBe(2);
  });
});
