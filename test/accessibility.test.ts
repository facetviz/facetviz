import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz, type AccessibilityPointContext } from '../src/index.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('accessibility', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('exposes the chart and every rendered point with useful semantics', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      title: { text: 'Quarterly revenue' },
      xAxis: { categories: ['Q1', 'Q2', 'Q3'] },
      series: [{ name: 'Revenue', data: [12, 18, 15] }],
    });

    const root = el.querySelector('svg')!;
    const points = [...el.querySelectorAll<SVGElement>('.facet-a11y-point')];
    expect(root.getAttribute('role')).toBe('figure');
    expect(root.getAttribute('aria-roledescription')).toBe('chart');
    expect(root.getAttribute('aria-label')).toBe('Quarterly revenue');
    expect(points.map((point) => point.getAttribute('aria-label'))).toEqual([
      'Revenue, Q1: 12',
      'Revenue, Q2: 18',
      'Revenue, Q3: 15',
    ]);
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('uses arrow, Home, and End keys as roving point navigation', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A', 'B', 'C'] },
      series: [{ name: 'S', data: [1, 2, 3] }],
    });
    const points = [...el.querySelectorAll<SVGElement>('.facet-a11y-point')];

    points[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    points[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    points[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    points[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('activates point clicks with Enter and Space', () => {
    const click = vi.fn();
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      seriesEvents: { click },
      series: [{ name: 'S', data: [7] }],
    });
    const point = el.querySelector<SVGElement>('.facet-a11y-point')!;

    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    point.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.calls[0][0]).toMatchObject({
      type: 'click', seriesName: 'S', pointIndex: 0, y: 7,
    });
  });

  it('supports custom point descriptions and specialised range labels', () => {
    const el = container();
    const formatter = vi.fn((ctx: AccessibilityPointContext) =>
      `${ctx.seriesName} custom ${ctx.pointIndex}`,
    );
    new FacetViz(el, {
      chart: { type: 'columnrange', animation: false },
      accessibility: { pointDescriptionFormatter: formatter },
      series: [{ name: 'Temperature', data: [['Jan', -2, 7]] }],
    });
    expect(el.querySelector('.facet-a11y-point')?.getAttribute('aria-label'))
      .toBe('Temperature custom 0');
    expect(formatter).toHaveBeenCalledWith(expect.objectContaining({ low: -2, high: 7 }));

    const fallbackEl = container();
    new FacetViz(fallbackEl, {
      chart: { type: 'columnrange', animation: false },
      series: [{ name: 'Temperature', data: [['Jan', -2, 7]] }],
    });
    expect(fallbackEl.querySelector('.facet-a11y-point')?.getAttribute('aria-label'))
      .toBe('Temperature, Jan: low -2, high 7');
  });

  it('exposes one focus stop when a datum has multiple hover targets', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'dumbbell', animation: false },
      xAxis: { categories: ['A', 'B'] },
      series: [{ name: 'Change', data: [['A', 2, 7], ['B', 4, 9]] }],
    });
    expect(el.querySelectorAll('.facet-a11y-point')).toHaveLength(2);
    expect(el.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('can disable keyboard navigation or all accessibility metadata', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      accessibility: { keyboardNavigation: false },
      series: [{ name: 'S', data: [1, 2] }],
    });
    const points = [...el.querySelectorAll<SVGElement>('.facet-a11y-point')];
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.getAttribute('tabindex') === null)).toBe(true);
    expect(points.every((point) => point.hasAttribute('aria-label'))).toBe(true);

    chart.update({ accessibility: { enabled: false } });
    const root = el.querySelector('svg')!;
    expect(root.hasAttribute('role')).toBe(false);
    expect(root.hasAttribute('aria-label')).toBe(false);
    expect(el.querySelector('.facet-a11y-point')).toBeNull();
  });
});
