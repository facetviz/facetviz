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

const data = Array.from({ length: 80 }, (_, i) => ({ x: i, y: (i * 7) % 50 }));

describe('drag-zoom', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('keeps hover and tooltips on scatter points', () => {
    const seen: unknown[] = [];
    const el = render({
      chart: { type: 'scatter', zoom: 'xy' },
      tooltip: { formatter: (ctx: { x: unknown }) => { seen.push(ctx.x); return ''; } },
      series: [{ name: 'S', data }],
    });
    const overlay = el.querySelector('.facet-zoom-overlay')!;
    const point = el.querySelectorAll('.facet-point')[3];
    expect(overlay).not.toBeNull();
    // The overlay sits under the points, so they get the pointer first.
    expect(overlay.compareDocumentPosition(point) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    point.dispatchEvent(new MouseEvent('mouseenter'));
    expect(seen).toEqual([3]);
  });

  it('zooms on a drag that starts on a point', () => {
    const el = render({ chart: { type: 'scatter', zoom: 'xy' }, series: [{ name: 'S', data }] });
    const o = el.querySelector('.facet-zoom-overlay')!;
    const x = Number(o.getAttribute('x')), y = Number(o.getAttribute('y'));
    el.querySelectorAll('.facet-point')[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x + 10, clientY: y + 10 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 200, clientY: y + 150 }));
    expect(el.querySelector('.facet-zoom-reset')).not.toBeNull();
  });

  it('ignores a press outside the plot', () => {
    const el = render({ chart: { type: 'scatter', zoom: 'xy' }, series: [{ name: 'S', data }] });
    el.querySelector('svg')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 300, clientY: 300 }));
    expect(el.querySelector('.facet-zoom-reset')).toBeNull();
  });
});
