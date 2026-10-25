import { describe, expect, it } from 'vitest';
import { buildCanvasGrid, paneAt, recordInPane, sortValues } from '../src/core/canvas-grid.js';

const records = [
  { Region: 'East', Category: 'Tech', Segment: 'Consumer', Month: 'Jan' },
  { Region: 'East', Category: 'Furniture', Segment: 'Consumer', Month: 'Feb' },
  { Region: 'West', Category: 'Office', Segment: 'Corporate', Month: 'Jan' },
  { Region: 'West', Category: 'Tech', Segment: 'Consumer', Month: 'Mar' },
];

const cells = (level: { cells: { value: string | null; start: number; span: number }[] }) =>
  level.cells.map((c) => [c.value, c.start, c.span]);

describe('canvas grid', () => {
  it('is one pane with nothing on the shelves', () => {
    const g = buildCanvasGrid({ records });
    expect(g.rows.leaves).toHaveLength(1);
    expect(g.columns.leaves).toHaveLength(1);
    expect(g.panes).toEqual([{ key: '#', row: 0, column: 0, empty: false }]);
    expect(g.rows.headers).toEqual([]);
  });

  it('nests: only combinations in the data, each group in its own first-seen order', () => {
    const g = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'dim', field: 'Category' }],
    });
    expect(g.columns.leaves.map((l) => l.values)).toEqual([
      ['East', 'Tech'], ['East', 'Furniture'], ['West', 'Office'], ['West', 'Tech'],
    ]);
    expect(cells(g.columns.headers[0])).toEqual([['East', 0, 2], ['West', 2, 2]]);
    expect(cells(g.columns.headers[1])).toEqual([['Tech', 0, 1], ['Furniture', 1, 1], ['Office', 2, 1], ['Tech', 3, 1]]);
    expect(g.columns.headers[1].cells[3].path).toEqual(['West', 'Tech']);
  });

  it('crosses: every value under every outer value, with empty panes marked', () => {
    const g = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'dim', field: 'Category', nest: 'cross', sort: 'asc' }],
    });
    expect(g.columns.leaves.map((l) => l.values.join('/'))).toEqual([
      'East/Furniture', 'East/Office', 'East/Tech', 'West/Furniture', 'West/Office', 'West/Tech',
    ]);
    expect(g.panes.map((p) => p.empty)).toEqual([false, true, false, true, false, false]);
  });

  it('keeps only combinations in the data for a nested level under a crossed one', () => {
    const g = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Segment', nest: 'cross' }],
      columns: [],
    });
    expect(g.rows.leaves.map((l) => l.values)).toEqual([['Consumer'], ['Corporate']]);
    const nested = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Category', nest: 'cross' }, { kind: 'dim', field: 'Region' }],
    });
    // Furniture and Office each occur in one region only.
    expect(nested.rows.leaves.map((l) => l.values.join('/'))).toEqual(['Tech/East', 'Tech/West', 'Furniture/East', 'Office/West']);
  });

  it('lays rows against columns into panes, row-major, small multiples style', () => {
    const g = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Segment' }],
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'category', field: 'Month', nest: 'cross' }],
    });
    expect(g.panes).toHaveLength(4);
    expect(paneAt(g, 1, 0)).toMatchObject({ key: 'Segment=Corporate#Region=East', empty: true });
    expect(paneAt(g, 1, 1)).toMatchObject({ key: 'Segment=Corporate#Region=West', empty: false });
    expect(g.columns.category).toBe('Month');
    // Crossed categories: every pane has the same axis.
    expect(g.columns.leaves.map((l) => l.categories)).toEqual([['Jan', 'Feb', 'Mar'], ['Jan', 'Feb', 'Mar']]);
    expect(recordInPane(g, paneAt(g, 0, 1)!, records[3])).toBe(true);
    expect(recordInPane(g, paneAt(g, 0, 1)!, records[2])).toBe(false);
  });

  it('gives a nested category axis each pane its own categories (the nested x axis)', () => {
    const g = buildCanvasGrid({
      records,
      columns: [{ kind: 'dim', field: 'Region' }, { kind: 'category', field: 'Category' }],
    });
    expect(g.columns.leaves.map((l) => l.categories)).toEqual([['Tech', 'Furniture'], ['Office', 'Tech']]);
    expect(g.columns.headers.map((h) => h.field)).toEqual(['Region']);
  });

  it('gives each measure on an axis its own leaf, innermost, inside the header cells', () => {
    const g = buildCanvasGrid({
      records,
      rows: [{ kind: 'dim', field: 'Segment' }, { kind: 'axis', measures: ['Sales', 'Profit'] }],
      columns: [{ kind: 'dim', field: 'Region' }],
    });
    expect(g.rows.leaves.map((l) => [l.values[0], l.measure])).toEqual([
      ['Consumer', 'Sales'], ['Consumer', 'Profit'], ['Corporate', 'Sales'], ['Corporate', 'Profit'],
    ]);
    expect(cells(g.rows.headers[0])).toEqual([['Consumer', 0, 2], ['Corporate', 2, 2]]);
    expect(g.rows.measures).toEqual(['Sales', 'Profit']);
    expect(paneAt(g, 1, 0)).toMatchObject({ rowMeasure: 'Profit', key: 'Segment=Consumer|@measure=Profit#Region=East' });
    // Both measures of a segment share whether there's data.
    expect(g.panes.filter((p) => p.row < 2).map((p) => p.empty)).toEqual([false, false, false, false]);
  });

  it('takes measures on both shelves (a measure-by-measure grid)', () => {
    const g = buildCanvasGrid({
      records,
      rows: [{ kind: 'axis', measures: ['Profit'] }],
      columns: [{ kind: 'axis', measures: ['Sales', 'Quantity'] }],
    });
    expect(g.panes.map((p) => `${p.rowMeasure}×${p.columnMeasure}`)).toEqual(['Profit×Sales', 'Profit×Quantity']);
  });

  it('keeps missing values as their own header value, last when sorted', () => {
    const g = buildCanvasGrid({
      records: [{ Region: null }, { Region: 'West' }, { Region: 'East' }, {}],
      columns: [{ kind: 'dim', field: 'Region', sort: 'asc' }],
    });
    expect(g.columns.leaves.map((l) => l.values[0])).toEqual(['East', 'West', null]);
    expect(g.columns.leaves[2].key).toBe('Region=\\0');
  });

  it('reads numbers and dates as their strings', () => {
    const g = buildCanvasGrid({
      records: [{ Year: 2024 }, { Year: 2023 }, { Year: 2024 }],
      rows: [{ kind: 'dim', field: 'Year', sort: 'asc' }],
    });
    expect(g.rows.leaves.map((l) => l.values[0])).toEqual(['2023', '2024']);
  });

  it('keeps keys apart when values contain the separators', () => {
    const g = buildCanvasGrid({
      records: [{ a: 'x|b=y', b: 'z' }, { a: 'x', b: 'y|b=z' }],
      columns: [{ kind: 'dim', field: 'a' }, { kind: 'dim', field: 'b' }],
    });
    const keys = g.columns.leaves.map((l) => l.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe('a=x\\|b\\=y|b=z');
  });

  it('sorts by a listed order, the rest after as found', () => {
    expect(sortValues(['b', 'c', null, 'a'], ['c', 'a'])).toEqual(['c', 'a', 'b', null]);
    expect(sortValues(['10', '9', 'a'], 'asc')).toEqual(['9', '10', 'a']);
    expect(sortValues(['a', null, 'b'], 'desc')).toEqual(['b', 'a', null]);
  });

  it('refuses shelves it cannot lay out', () => {
    expect(() => buildCanvasGrid({ records, columns: [{ kind: 'category', field: 'Month' }, { kind: 'dim', field: 'Region' }] }))
      .toThrow(/last item/);
    expect(() => buildCanvasGrid({ records, rows: [{ kind: 'axis', measures: [] }] })).toThrow(/at least one measure/);
    expect(() => buildCanvasGrid({ records, rows: [{ kind: 'dim', field: 'Region' }], columns: [{ kind: 'dim', field: 'Region' }] }))
      .toThrow(/twice/);
  });

  it('builds a large grid in one pass per level', () => {
    const big = Array.from({ length: 50_000 }, (_, i) => ({ a: `a${i % 20}`, b: `b${i % 50}`, c: `c${i % 7}` }));
    const t = performance.now();
    const g = buildCanvasGrid({
      records: big,
      rows: [{ kind: 'dim', field: 'a' }, { kind: 'dim', field: 'c' }],
      columns: [{ kind: 'dim', field: 'b' }],
    });
    expect(g.panes.length).toBe(g.rows.leaves.length * 50);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
