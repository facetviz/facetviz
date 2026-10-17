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

describe('scatter opacity', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('fades the fill of every point, also of points with their own color', () => {
    const el = render({
      chart: { type: 'scatter' },
      series: [{ name: 'S', opacity: 0.3, data: [{ x: 1, y: 1 }, { x: 2, y: 2, color: '#ff0000' }] }],
    });
    const points = [...el.querySelectorAll('.facet-point')];
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(p.getAttribute('fill-opacity')).toBe('0.3');
      expect(p.getAttribute('stroke-opacity')).toBeNull();
    }
    expect(points[1].getAttribute('fill')).toBe('#ff0000');
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

describe('series borders', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('outlines bars only when asked', () => {
    const el = render({
      chart: { type: 'column' },
      xAxis: { categories: ['A', 'B'] },
      series: [
        { name: 'B', borderColor: 'rgba(0,0,0,0.5)', borderWidth: 2, data: [1, 2] },
        { name: 'R', borderWidth: 3, borderRadius: 4, color: '#ff0000', data: [2, 3] },
        { name: 'P', data: [3, 4] },
      ],
    });
    const bar = el.querySelector('.facet-column.B .facet-point')!;
    expect(bar.getAttribute('stroke')).toBe('rgba(0,0,0,0.5)');
    expect(bar.getAttribute('stroke-width')).toBe('2');
    const rounded = el.querySelector('.facet-column.R path.facet-point')!;
    expect(rounded.getAttribute('stroke')).toBe('#ff0000');
    expect(rounded.getAttribute('stroke-width')).toBe('3');
    expect(el.querySelector('.facet-column.P .facet-point')!.getAttribute('stroke')).toBeNull();
  });

  it('sets the line between pie slices, or none', () => {
    const pie = (extra: object) =>
      render({ chart: { type: 'pie' }, series: [{ name: 'S', ...extra, data: [{ name: 'a', y: 1 }, { name: 'b', y: 2 }] }] });
    const a = pie({ borderColor: '#000000', borderWidth: 2 }).querySelector('path.facet-point')!;
    expect([a.getAttribute('stroke'), a.getAttribute('stroke-width')]).toEqual(['#000000', '2']);
    document.body.innerHTML = '';
    expect(pie({ borderWidth: 0 }).querySelector('path.facet-point')!.getAttribute('stroke')).toBeNull();
    document.body.innerHTML = '';
    expect(pie({}).querySelector('path.facet-point')!.getAttribute('stroke')).toBe('#ffffff');
  });

  it('outlines boxes in the series border', () => {
    const el = render({
      chart: { type: 'boxplot' },
      xAxis: { categories: ['A'] },
      series: [{ name: 'X', borderColor: '#123456', borderWidth: 3, data: [{ min: 1, q1: 2, median: 3, q3: 4, max: 5 }] }],
    });
    const rect = el.querySelector('.facet-point rect')!;
    expect([rect.getAttribute('stroke'), rect.getAttribute('stroke-width')]).toEqual(['#123456', '3']);
  });
});
