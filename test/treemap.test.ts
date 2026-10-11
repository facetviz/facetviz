import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FacetViz, validateChartOptions } from '../src/index.js';
import { squarify, type TreemapRect } from '../src/series/treemap.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

const area = (r: TreemapRect) => r.width * r.height;
const overlap = (a: TreemapRect, b: TreemapRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

describe('squarify', () => {
  const box = { x: 10, y: 20, width: 600, height: 400 };

  it('tiles the box with areas proportional to the values', () => {
    const values = [6, 6, 4, 3, 2, 2, 1];
    const rects = squarify(values, box);
    const total = values.reduce((a, b) => a + b, 0);
    rects.forEach((r, i) => {
      expect(area(r)).toBeCloseTo((values[i] / total) * box.width * box.height, 6);
      expect(r.x).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(r.y).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height + 1e-6);
    });
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBeLessThan(1e-6);
    expect(rects.reduce((s, r) => s + area(r), 0)).toBeCloseTo(box.width * box.height, 4);
  });

  it('keeps rectangles close to square', () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], box);
    for (const r of rects) expect(Math.max(r.width / r.height, r.height / r.width)).toBeLessThan(4);
  });

  it('keeps the input order and gives nothing to empty or bad values', () => {
    const rects = squarify([1, 0, -3, Number.NaN, 3], box);
    expect(area(rects[4])).toBeCloseTo(3 * area(rects[0]), 6);
    expect([1, 2, 3].map((i) => area(rects[i]))).toEqual([0, 0, 0]);
    expect(squarify([], box)).toEqual([]);
    expect(squarify([1, 2], { ...box, width: 0 }).every((r) => area(r) === 0)).toBe(true);
  });
});

describe('treemap series', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws one rectangle per value, labelled, in palette colours', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'treemap', animation: false, height: 400 },
      series: [{ name: 'Sales', data: [{ name: 'West', value: 40 }, { name: 'East', value: 30 }, { name: 'North', value: 20 }, { name: 'South', value: 10 }] }],
    });
    const rects = [...el.querySelectorAll('.facet-treemap rect.facet-point')];
    expect(rects).toHaveLength(4);
    const fills = new Set(rects.map((r) => r.getAttribute('fill')));
    expect(fills.size).toBe(4);
    const texts = [...el.querySelectorAll('.facet-treemap text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['West', 'East', '40']));
    // The biggest value gets the biggest rectangle.
    const areaOf = (r: Element) => Number(r.getAttribute('width')) * Number(r.getAttribute('height'));
    expect(areaOf(rects[0])).toBeGreaterThan(areaOf(rects[3]));
  });

  it('nests children in a framed parent with its name in a header', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'treemap', animation: false, height: 400 },
      series: [
        {
          name: 'Org',
          data: [
            { id: 'eng', name: 'Engineering' },
            { id: 'fe', parent: 'eng', name: 'Frontend', value: 8 },
            { id: 'be', parent: 'eng', name: 'Backend', value: 12 },
            { id: 'sales', name: 'Sales' },
            { id: 'inside', parent: 'sales', name: 'Inside', value: 6 },
          ],
        },
      ],
    });
    const groups = [...el.querySelectorAll('.facet-treemap rect.facet-treemap-group')];
    expect(groups).toHaveLength(2);
    const leaves = [...el.querySelectorAll('.facet-treemap rect.facet-point:not(.facet-treemap-group)')];
    expect(leaves).toHaveLength(3);
    const texts = [...el.querySelectorAll('.facet-treemap text')].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Engineering', 'Backend']));
    // Every leaf sits inside its parent's frame.
    const box = (r: Element) => ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)));
    const [ex, ey, ew, eh] = box(groups[0]);
    for (const leaf of leaves.slice(0, 2)) {
      const [x, y, w, h] = box(leaf);
      expect(x).toBeGreaterThanOrEqual(ex);
      expect(y).toBeGreaterThanOrEqual(ey);
      expect(x + w).toBeLessThanOrEqual(ex + ew + 1e-6);
      expect(y + h).toBeLessThanOrEqual(ey + eh + 1e-6);
    }
  });

  it('honours dataLabels: a formatter writes the value, enabled false hides labels', () => {
    const data = [{ name: 'A', value: 1500 }, { name: 'B', value: 500 }];
    const el = container();
    new FacetViz(el, {
      chart: { type: 'treemap', animation: false, height: 400 },
      series: [{ name: 'S', data, dataLabels: { formatter: (c) => `$${c.y}` } }],
    });
    expect([...el.querySelectorAll('.facet-treemap text')].map((t) => t.textContent)).toContain('$1500');
    const off = container();
    new FacetViz(off, { chart: { type: 'treemap', animation: false, height: 400 }, series: [{ name: 'S', data, dataLabels: { enabled: false } }] });
    expect(off.querySelectorAll('.facet-treemap text')).toHaveLength(0);
  });

  it('reports clicks on a rectangle as point events', () => {
    const el = container();
    const click = vi.fn();
    new FacetViz(el, {
      chart: { type: 'treemap', animation: false, height: 400 },
      seriesEvents: { click },
      series: [{ name: 'S', data: [{ name: 'A', value: 2 }, { name: 'B', value: 1 }] }],
    });
    el.querySelector('.facet-treemap rect.facet-point')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0][0]).toMatchObject({ type: 'click', seriesName: 'S', pointIndex: 0 });
  });

  it('draws nothing for an all-zero tree, and rejects negative values', () => {
    const el = container();
    new FacetViz(el, { chart: { type: 'treemap', animation: false }, series: [{ name: 'S', data: [{ name: 'A', value: 0 }] }] });
    expect(el.querySelectorAll('.facet-treemap rect')).toHaveLength(0);
    const issues = validateChartOptions({ chart: { type: 'treemap' }, series: [{ name: 'S', data: [{ name: 'A', value: -1 }] }] }).issues.map((i) => i.code);
    expect(issues).toContain('series.value.non_negative');
    const dupes = validateChartOptions({ chart: { type: 'treemap' }, series: [{ name: 'S', data: [{ id: 'a', value: 1 }, { id: 'a', value: 2 }] }] }).issues.map((i) => i.code);
    expect(dupes).toContain('hierarchy.id.duplicate');
  });
});
