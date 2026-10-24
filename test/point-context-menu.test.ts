import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data: [string, number][] = [
  ['A', 3],
  ['B', 5],
];

describe('point context menu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports a right-clicked point apart from a click, for every kind of mark', () => {
    for (const type of ['column', 'line', 'scatter', 'pie'] as const) {
      const el = container(600, 400);
      const click = vi.fn();
      const contextMenu = vi.fn();
      new FacetViz(el, {
        chart: { animation: false },
        xAxis: { categories: ['A', 'B'] },
        series: [{ type, name: 'S', data, marker: { enabled: true } }],
        seriesEvents: { click, contextMenu },
      });
      const point = el.querySelectorAll('.facet-point')[1] as SVGElement;
      expect(point, type).toBeTruthy();
      const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      point.dispatchEvent(right);
      expect(right.defaultPrevented, type).toBe(true);
      expect(contextMenu, type).toHaveBeenCalledTimes(1);
      expect(contextMenu.mock.calls[0][0]).toMatchObject({ type: 'contextMenu', pointIndex: 1, domEvent: right });
      expect(click, type).not.toHaveBeenCalled();
      point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(click, type).toHaveBeenCalledTimes(1);
      expect(contextMenu, type).toHaveBeenCalledTimes(1);
    }
  });

  it('opens it from the keyboard with the menu key or Shift+F10', () => {
    const el = container(600, 400);
    const contextMenu = vi.fn();
    new FacetViz(el, {
      chart: { animation: false },
      xAxis: { categories: ['A', 'B'] },
      series: [{ type: 'column', name: 'S', data }],
      seriesEvents: { contextMenu },
    });
    const point = el.querySelector('.facet-point') as SVGElement;
    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    expect(contextMenu).toHaveBeenCalledTimes(2);
  });

  it("leaves the browser's own menu alone without a contextMenu handler", () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      xAxis: { categories: ['A', 'B'] },
      series: [{ type: 'column', name: 'S', data }],
      seriesEvents: { click: () => {} },
    });
    const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    (el.querySelector('.facet-point') as SVGElement).dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);
  });
});
