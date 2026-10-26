import { describe, expect, it } from 'vitest';
import { buildCanvasGrid } from '../src/core/canvas-grid.js';
import { layoutCanvas } from '../src/core/canvas-layout.js';

const outer = { x: 10, y: 20, width: 600, height: 400 };
const records = [
  { Region: 'East', Category: 'Tech', Segment: 'Consumer' },
  { Region: 'East', Category: 'Furniture', Segment: 'Consumer' },
  { Region: 'East', Category: 'Office', Segment: 'Corporate' },
  { Region: 'West', Category: 'Tech', Segment: 'Consumer' },
];

describe('canvas layout', () => {
  it('puts a lone pane inside the axis bands, like the old single-panel inset', () => {
    const l = layoutCanvas(buildCanvasGrid({ records: [] }), outer, { axes: { left: 50, right: 8, top: 6, bottom: 40 } });
    expect(l.panes).toHaveLength(1);
    expect(l.panes[0].rect).toEqual({ x: 60, y: 26, width: 600 - 50 - 8, height: 400 - 6 - 40 });
    expect(l.plotArea).toEqual(l.panes[0].rect);
    expect(l.axisBands.left[0]).toEqual({ x: 10, y: 26, width: 50, height: 354 });
    expect(l.axisBands.bottom[0]).toEqual({ x: 60, y: 380, width: 542, height: 40 });
  });

  it('places header levels outside the axis bands, then shares the rest among panes', () => {
    const grid = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Segment' }],
      columns: [{ kind: 'dim', field: 'Region' }],
    });
    const l = layoutCanvas(grid, outer, {
      rowHeaders: [80],
      columnHeaders: [24],
      axes: { left: 40, bottom: 30 },
      gap: { rows: 10, columns: 20 },
    });
    // 600 - 80 headers - 40 axis = 480 wide, two columns with a 20 gap.
    expect(l.plotArea).toEqual({ x: 130, y: 44, width: 480, height: 346 });
    expect(l.columns).toEqual([{ x: 130, width: 230 }, { x: 380, width: 230 }]);
    expect(l.rows).toEqual([{ y: 44, height: 168 }, { y: 222, height: 168 }]);
    expect(l.panes[3].rect).toEqual({ x: 380, y: 222, width: 230, height: 168 });
    expect(l.headers.columns[0].map((c) => [c.cell.value, c.rect])).toEqual([
      ['East', { x: 130, y: 20, width: 230, height: 24 }],
      ['West', { x: 380, y: 20, width: 230, height: 24 }],
    ]);
    expect(l.headers.rows[0][1].rect).toEqual({ x: 10, y: 222, width: 80, height: 168 });
    // One axis band per pane row on the left, per pane column at the bottom.
    expect(l.axisBands.left.map((r) => r.y)).toEqual([44, 222]);
    expect(l.axisBands.bottom.map((r) => r.x)).toEqual([130, 380]);
  });

  it('spans an outer header across its inner cells and the gaps between them', () => {
    const grid = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'dim', field: 'Category' }],
    });
    const l = layoutCanvas(grid, { x: 0, y: 0, width: 430, height: 200 }, { columnHeaders: [20, 18], gap: { columns: 10 } });
    // Four leaves of 100 with three 10 px gaps.
    expect(l.columns.map((c) => c.x)).toEqual([0, 110, 220, 330]);
    const [east, west] = l.headers.columns[0];
    expect(east.rect).toEqual({ x: 0, y: 0, width: 320, height: 20 });
    expect(west.rect).toEqual({ x: 330, y: 0, width: 100, height: 20 });
    expect(l.headers.columns[1][0].rect).toEqual({ x: 0, y: 20, width: 100, height: 18 });
  });

  it('sizes nested category panes by their number of categories, so bars keep one width', () => {
    const grid = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'category', field: 'Category' }],
    });
    const l = layoutCanvas(grid, { x: 0, y: 0, width: 400, height: 100 });
    // East has three categories, West one.
    expect(l.columns.map((c) => c.width)).toEqual([300, 100]);
  });

  it('shares equally when categories are crossed, or as weighted', () => {
    const crossed = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'category', field: 'Category', nest: 'cross' }],
    });
    expect(layoutCanvas(crossed, { x: 0, y: 0, width: 400, height: 100 }).columns.map((c) => c.width)).toEqual([200, 200]);
    expect(layoutCanvas(crossed, { x: 0, y: 0, width: 400, height: 100 }, { weights: { columns: [1, 3] } }).columns.map((c) => c.width))
      .toEqual([100, 300]);
    expect(layoutCanvas(crossed, { x: 0, y: 0, width: 400, height: 100 }, { weights: { columns: [0, 0] } }).columns.map((c) => c.width))
      .toEqual([200, 200]);
  });

  it('never gives a pane a negative size when the bands take all the room', () => {
    const grid = buildCanvasGrid({ records, columns: [{ kind: 'dim', field: 'Region' }] });
    const l = layoutCanvas(grid, { x: 0, y: 0, width: 50, height: 40 }, { axes: { left: 40, right: 30 }, gap: { columns: 10 } });
    expect(l.columns.every((c) => c.width >= 0)).toBe(true);
  });

  it('stacks measure rows inside their header cell', () => {
    const grid = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Segment' }, { kind: 'axis', measures: ['Sales', 'Profit'] }],
    });
    const l = layoutCanvas(grid, { x: 0, y: 0, width: 300, height: 400 }, { rowHeaders: [70] });
    expect(l.rows.map((r) => r.height)).toEqual([100, 100, 100, 100]);
    expect(l.headers.rows[0].map((c) => c.rect.height)).toEqual([200, 200]);
    expect(l.panes.map((p) => p.key)).toEqual(grid.panes.map((p) => p.key));
  });
});
