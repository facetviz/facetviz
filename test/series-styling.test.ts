import { describe, it, expect, beforeEach } from 'vitest';
import { FacetViz } from '../src/index.js';

function render(options: Record<string, unknown>): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { chart: { animation: false, ...(options.chart as object) }, ...options } as never);
  return el;
}

const widths = (el: HTMLElement) =>
  [...el.querySelectorAll('.facet-column rect, .facet-column path.facet-point, .facet-column path')]
    .map((r) => Number(r.getAttribute('width') ?? NaN))
    .filter((w) => Number.isFinite(w));

describe('line dashStyle', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('dashes line and area strokes', () => {
    const el = render({
      chart: { type: 'line' },
      xAxis: { categories: ['A', 'B', 'C'] },
      series: [
        { name: 'L', dashStyle: '6 4', data: [1, 2, 3] },
        { name: 'A', type: 'area', dashStyle: '1 4', data: [2, 3, 4] },
        { name: 'S', data: [3, 4, 5] },
      ],
    });
    expect(el.querySelector('.facet-line.L path')?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(el.querySelector('.facet-line.S path')?.getAttribute('stroke-dasharray')).toBeNull();
    const dashed = [...el.querySelectorAll('.facet-series.A path')].map((p) => p.getAttribute('stroke-dasharray'));
    expect(dashed).toContain('1 4');
  });
});

describe('line opacity', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('fades the whole series group', () => {
    const el = render({
      chart: { type: 'line' },
      xAxis: { categories: ['A', 'B'] },
      series: [{ name: 'F', opacity: 0.4, data: [1, 2] }, { name: 'S', data: [2, 3] }],
    });
    expect(el.querySelector('.facet-line.F')?.getAttribute('opacity')).toBe('0.4');
    expect(el.querySelector('.facet-line.S')?.getAttribute('opacity')).toBeNull();
  });
});

describe('column padding', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const chart = (extra: Record<string, unknown>) =>
    render({
      chart: { type: 'column' },
      xAxis: { categories: ['A', 'B'] },
      series: [{ name: 'S', data: [1, 2], ...extra }],
    });

  it('widens bars as group and point padding shrink', () => {
    const base = Math.max(...widths(chart({})));
    document.body.innerHTML = '';
    const tight = Math.max(...widths(chart({ groupPadding: 0, pointPadding: 0 })));
    expect(tight).toBeGreaterThan(base);
    document.body.innerHTML = '';
    const loose = Math.max(...widths(chart({ groupPadding: 0.6 })));
    expect(loose).toBeLessThan(base);
  });
});

describe('pie startAngle and outerSize', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const slicePaths = (extra: Record<string, unknown>) => {
    const el = render({ chart: { type: 'pie' }, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', y: 1 }, { name: 'b', y: 1 }], ...extra }] });
    return [...el.querySelectorAll('.facet-pie path')].map((p) => p.getAttribute('d') ?? '');
  };

  it('turns the first slice and shrinks the radius', () => {
    const base = slicePaths({});
    document.body.innerHTML = '';
    const turned = slicePaths({ startAngle: 90 });
    expect(turned[0]).not.toBe(base[0]);
    document.body.innerHTML = '';
    const small = slicePaths({ outerSize: '50%' });
    const radius = (d: string) => Number(/A\s*([\d.]+)/.exec(d)?.[1]);
    expect(radius(small[0])).toBeCloseTo(radius(base[0]) / 2, 0);
  });
});
