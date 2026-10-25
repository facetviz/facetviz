import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';
import { buildCanvasGrid } from '../src/core/canvas-grid.js';
import { layoutCanvas } from '../src/core/canvas-layout.js';

const records = [
  { region: 'East', cat: 'Tech' }, { region: 'East', cat: 'Office' }, { region: 'East', cat: 'Furniture' },
  { region: 'West', cat: 'Tech' },
];

describe('canvas fit in the layout', () => {
  const grid = buildCanvasGrid({ records, rows: [{ kind: 'dim', field: 'region' }], columns: [{ kind: 'dim', field: 'cat' }] });
  const outer = { x: 0, y: 0, width: 500, height: 300 };
  const bands = { axes: { left: 40, bottom: 30 }, gap: { columns: 10, rows: 10 } };

  it('fills the room by default, the natural size being the given one', () => {
    const l = layoutCanvas(grid, outer, bands);
    expect(l.natural).toEqual({ width: 500, height: 300 });
  });

  it('fixes both directions with standard, at the cell size', () => {
    const l = layoutCanvas(grid, outer, { ...bands, fit: 'standard', cell: { width: 120, height: 90 } });
    expect(l.columns.map((c) => c.width)).toEqual([120, 120, 120]);
    expect(l.rows.map((r) => r.height)).toEqual([90, 90]);
    expect(l.plotArea.width).toBe(120 * 3 + 20);
    expect(l.natural).toEqual({ width: 40 + 380, height: 30 + 190 });
  });

  it('fits columns to the width and fixes row heights with width (and the other way with height)', () => {
    const w = layoutCanvas(grid, outer, { ...bands, fit: 'width', cell: { height: 100 } });
    expect(w.rows.map((r) => r.height)).toEqual([100, 100]);
    expect(w.natural.width).toBe(500);
    expect(w.natural.height).toBe(30 + 210);
    const h = layoutCanvas(grid, outer, { ...bands, fit: 'height' });
    expect(h.columns.map((c) => c.width)).toEqual([200, 200, 200]);
    expect(h.natural.height).toBe(300);
  });

  it('sizes nested category panes per category', () => {
    const nested = buildCanvasGrid({ records, columns: [{ kind: 'dim', field: 'region' }, { kind: 'category', field: 'cat' }] });
    const l = layoutCanvas(nested, outer, { fit: 'standard' });
    // East has three categories, West one: 40 px each by default.
    expect(l.columns.map((c) => c.width)).toEqual([120, 40]);
  });
});

function container(width = 600, height = 400): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const trellisData = [
  { x: 'Jan', y: 3, cat: 'Tech', region: 'East' }, { x: 'Jan', y: 4, cat: 'Office', region: 'East' },
  { x: 'Jan', y: 6, cat: 'Tech', region: 'West' }, { x: 'Jan', y: 2, cat: 'Office', region: 'West' },
];

describe('a chart with a fixed fit', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const make = (options: Partial<ChartOptions>, events: Record<string, unknown> = {}) => {
    const el = container();
    const chart = new FacetViz(el, {
      xAxis: { categories: ['Jan'] },
      series: [{ type: 'column', name: 'S', data: trellisData }],
      trellis: { columns: 'cat', rows: 'region' },
      ...options,
      chart: { animation: false, responsive: false, events, ...options.chart },
    } as ChartOptions);
    return { el, chart, svg: el.querySelector('svg')! };
  };

  it('grows to its canvas\'s natural size with standard, and keeps it rather than shrinking into its box', () => {
    const naturalSize = vi.fn();
    const { chart, svg, el } = make({ canvas: { fit: 'standard', cell: { width: 300, height: 250 } } }, { canvasNaturalSize: naturalSize });
    const { width, height } = chart.size;
    expect(width).toBeGreaterThan(600);
    expect(height).toBeGreaterThan(400);
    expect(Number(svg.getAttribute('width'))).toBe(width);
    expect(svg.style.maxWidth).toBe('none');
    expect(naturalSize).toHaveBeenCalledWith({ width, height });
    // Each pane is the cell size.
    const area = el.querySelector('[data-fv-kind="plotArea"]')!;
    expect(Number(area.getAttribute('width'))).toBeCloseTo(300, 6);
    expect(Number(area.getAttribute('height'))).toBeCloseTo(250, 6);
  });

  it('keeps its width with fit width, taking the height its pane rows need', () => {
    const { chart, el } = make({ canvas: { fit: 'width', cell: { height: 60 } } });
    expect(chart.size.width).toBe(600);
    expect(chart.size.height).toBeLessThan(400);
    expect(Number(el.querySelector('[data-fv-kind="plotArea"]')!.getAttribute('height'))).toBeCloseTo(60, 6);
  });

  it('works on a plain one-pane chart and a nested axis too', () => {
    const plain = make({ trellis: undefined, series: [{ type: 'column', name: 'S', data: [1, 2] }], xAxis: { categories: ['A', 'B'] }, canvas: { fit: 'standard', cell: { width: 500, height: 500 } } });
    expect(Number(plain.el.querySelector('[data-fv-kind="plotArea"]')!.getAttribute('width'))).toBeCloseTo(500, 6);
    const nested = make({
      trellis: undefined,
      xAxis: { dimensions: ['region', 'cat'] },
      series: [{ type: 'column', name: 'S', data: trellisData }],
      canvas: { fit: 'standard', cell: { width: 100, height: 200 } },
    });
    const widths = [...nested.el.querySelectorAll('[data-fv-kind="plotArea"]')].map((a) => Number(a.getAttribute('width')));
    expect(widths.map((w) => Math.round(w))).toEqual([200, 200]);
  });

  it('stays in its box by default', () => {
    const { chart, svg } = make({});
    expect(chart.size).toEqual({ width: 600, height: 400 });
    expect(svg.style.maxWidth).toBe('100%');
  });
});

describe('resize handles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const pointer = (type: string, x: number, y: number) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });

  it('draws none unless the host listens for canvasResize', () => {
    const el = container();
    new FacetViz(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A'] }, series: [{ name: 'S', data: [1] }] });
    expect(el.querySelectorAll('.facet-resize-handle')).toHaveLength(0);
  });

  it('puts a handle on each axis band\'s edge facing the plot, and reports a drag', () => {
    const canvasResize = vi.fn();
    const canvasClick = vi.fn();
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false, responsive: false, events: { canvasResize, canvasClick } },
      xAxis: { categories: ['A', 'B'] },
      series: [{ name: 'S', data: [1, 2] }],
    });
    const handles = [...el.querySelectorAll('.facet-resize-handle')];
    expect(handles.map((h) => h.getAttribute('data-fv-resize')).sort()).toEqual(['axis:xAxis[0]', 'axis:yAxis[0]']);
    const left = el.querySelector('[data-fv-resize="axis:yAxis[0]"]')!;
    const area = el.querySelector('[data-fv-kind="plotArea"]')!;
    // The handle straddles the plot's left edge.
    expect(Number(left.getAttribute('x')) + 3).toBeCloseTo(Number(area.getAttribute('x')), 6);
    const start = Number(area.getAttribute('x'));
    left.dispatchEvent(pointer('pointerdown', start, 100));
    left.dispatchEvent(pointer('pointermove', start + 30, 100));
    expect(el.querySelector('.facet-resize-guide')).toBeTruthy();
    left.dispatchEvent(pointer('pointerup', start + 40, 100));
    expect(el.querySelector('.facet-resize-guide')).toBeNull();
    const [move, end] = canvasResize.mock.calls.map((c) => c[0]);
    expect(move).toMatchObject({ phase: 'move', kind: 'axis', id: 'yAxis[0]', side: 'left' });
    expect(end).toMatchObject({ phase: 'end', kind: 'axis', id: 'yAxis[0]' });
    expect(end.size - move.size).toBe(10);
    // The bottom band grows when its edge is dragged up, toward the plot.
    const bottom = el.querySelector('[data-fv-resize="axis:xAxis[0]"]')!;
    const y = Number(bottom.getAttribute('y')) + 3;
    bottom.dispatchEvent(pointer('pointerdown', 200, y));
    bottom.dispatchEvent(pointer('pointerup', 200, y - 20));
    const last = canvasResize.mock.calls[canvasResize.mock.calls.length - 1][0];
    expect(last).toMatchObject({ phase: 'end', id: 'xAxis[0]', side: 'bottom' });
    // A handle is no canvas part to click.
    left.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvasClick).not.toHaveBeenCalled();
  });

  it('puts handles on small multiples\' header levels and nested header levels', () => {
    const canvasResize = vi.fn();
    const sm = container();
    new FacetViz(sm, {
      chart: { animation: false, events: { canvasResize } },
      xAxis: { categories: ['Jan'] },
      trellis: { columns: 'cat', rows: 'region' },
      series: [{ type: 'column', name: 'S', data: trellisData }],
    });
    const ids = [...sm.querySelectorAll('.facet-resize-handle')].map((h) => h.getAttribute('data-fv-resize'));
    expect(ids).toEqual(expect.arrayContaining(['header:cat', 'header:region', 'axis:yAxis[0]', 'axis:xAxis[0]']));
    const nested = container();
    new FacetViz(nested, {
      chart: { animation: false, events: { canvasResize } },
      xAxis: { dimensions: ['region', 'cat'] },
      series: [{ type: 'column', name: 'S', data: trellisData }],
    });
    const region = nested.querySelector('[data-fv-resize="header:region"]')!;
    expect(region).toBeTruthy();
    // Below the plot, its edge facing the panes is its top.
    const y = Number(region.getAttribute('y')) + 3;
    region.dispatchEvent(pointer('pointerdown', 100, y));
    region.dispatchEvent(pointer('pointerup', 100, y - 12));
    expect(canvasResize.mock.calls[canvasResize.mock.calls.length - 1][0]).toMatchObject({ kind: 'header', id: 'region', side: 'bottom', size: 18 + 12 });
  });
});
