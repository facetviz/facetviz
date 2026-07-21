import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width = 600, height = 400): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('regressions', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('escapes untrusted values in the built-in tooltip', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      series: [{ name: '<img src=x onerror=evil()>', data: [['<svg onload=evil()>', 2]] }],
    });
    el.querySelector('.facet-point')?.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = el.querySelector('.facet-tooltip')!;
    expect(tooltip.querySelector('img')).toBeNull();
    expect(tooltip.querySelector('svg')).toBeNull();
    expect(tooltip.textContent).toContain('<img src=x onerror=evil()>');
  });

  it('stacks matching x values rather than matching array positions', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'column', animation: false },
      series: [
        { stacking: 'normal', data: [['A', 1], ['B', 2]] },
        { stacking: 'normal', data: [['B', 3]] },
      ],
    });
    expect(chart.series[1].points[0].stackLow).toBe(2);
    expect(chart.series[1].points[0].stackHigh).toBe(5);
  });

  it('renders null values as separate line segments', () => {
    const el = container();
    new FacetViz(el, { chart: { animation: false }, series: [{ data: [1, null, 3] }] });
    const paths = [...el.querySelectorAll('.facet-line path')];
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.getAttribute('d')?.startsWith('M '))).toBe(true);
  });

  it('fully resolves series defaults, palette, type, and dimensions on update', () => {
    const el = container(500, 300);
    const chart = new FacetViz(el, {
      chart: { animation: false },
      plotOptions: { line: { lineWidth: 9 } },
      series: [{ data: [1, 2] }],
    });
    chart.update({
      chart: { type: 'column', width: 777 },
      colors: ['#ff0000'],
      plotOptions: { column: { columnWidth: 12 } },
      series: [{ data: [2, 3] }],
    });
    expect(chart.series[0].type).toBe('column');
    expect(chart.series[0].color).toBe('#ff0000');
    expect(chart.series[0].options.columnWidth).toBe(12);
    expect(el.querySelector('svg')?.getAttribute('width')).toBe('777');
  });

  it('preserves legend visibility across data replacement', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      series: [{ name: 'A', data: [1] }, { name: 'B', data: [2] }],
    });
    el.querySelectorAll('.facet-legend-item')[1].dispatchEvent(new MouseEvent('click'));
    expect(chart.series[1].visible).toBe(false);
    chart.setData(0, [3]);
    expect(chart.series[1].visible).toBe(false);
  });

  it('does not recreate overlays after destruction and restores container style', () => {
    const el = container();
    el.style.position = 'static';
    const chart = new FacetViz(el, { chart: { animation: false }, series: [{ data: [1] }] });
    expect(el.style.position).toBe('relative');
    chart.destroy();
    chart.reflow();
    expect(el.querySelector('.facet-tooltip')).toBeNull();
    expect(el.style.position).toBe('static');
  });

  it('validates histogram bin counts', () => {
    expect(() => new FacetViz(container(), {
      chart: { type: 'histogram', animation: false },
      series: [{ bins: 0, data: [1, 2, 3] }],
    })).toThrow(/positive integer/);
  });

  it('rejects cyclic sankey data', () => {
    expect(() => new FacetViz(container(), {
      chart: { type: 'sankey', animation: false },
      series: [{ data: [
        { from: 'A', to: 'B', weight: 1 },
        { from: 'B', to: 'A', weight: 1 },
      ] }],
    })).toThrow(/acyclic/);
  });

  it('restores responsive option overrides when rendering throws', () => {
    const chart = new FacetViz(container(100, 100), {
      chart: { animation: false },
      xAxis: { lineWidth: 2 },
      yAxis: { lineWidth: 3 },
      series: [{ data: [1] }],
    });
    expect(() => chart.update({
      chart: { events: { render: () => { throw new Error('render failed'); } } },
    })).toThrow('render failed');
    expect(Array.isArray(chart.options.xAxis) ? undefined : chart.options.xAxis?.lineWidth).toBe(2);
    expect(Array.isArray(chart.options.yAxis) ? undefined : chart.options.yAxis?.lineWidth).toBe(3);
  });
});
