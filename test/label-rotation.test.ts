import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const column = (dataLabels: Record<string, unknown>) => ({
  chart: { animation: false },
  series: [
    {
      type: 'column' as const,
      name: 'Sales',
      dataLabels: { enabled: true, ...dataLabels },
      data: [['East', 120000], ['West', 98000]] as [string, number][],
    },
  ],
});

const label = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('text')].find((t) => t.textContent === text)!;

describe('rotated data labels', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('starts a label turned upright above its column', () => {
    const el = container(600, 400);
    new FacetViz(el, column({ rotation: -90 }));
    const t = label(el, '120000');
    expect(t.getAttribute('transform')).toMatch(/^rotate\(-90 /);
    expect(t.getAttribute('text-anchor')).toBe('start');
    expect(t.getAttribute('dominant-baseline')).toBe('middle');
  });

  it('hangs an inside label down from the column top', () => {
    const el = container(600, 400);
    new FacetViz(el, column({ rotation: -90, position: 'inside' }));
    expect(label(el, '120000').getAttribute('text-anchor')).toBe('end');
  });

  it('keeps an unturned label centred on its column', () => {
    const el = container(600, 400);
    new FacetViz(el, column({}));
    const t = label(el, '120000');
    expect(t.getAttribute('transform')).toBeNull();
    expect(t.getAttribute('text-anchor')).toBe('middle');
  });

  it('raises the value axis to make room for an upright label', () => {
    const plotTop = (rotation?: number) => {
      document.body.innerHTML = '';
      const el = container(600, 300);
      new FacetViz(el, column(rotation ? { rotation, format: 'Total sales {y}' } : { format: 'Total sales {y}' }));
      const t = label(el, 'Total sales 120000');
      const clip = el.querySelector('clipPath rect');
      return Number(t.getAttribute('y')) - Number(clip?.getAttribute('y'));
    };
    // Room above the tallest column's label start: an upright label needs
    // about its whole length there.
    expect(plotTop(-90)).toBeGreaterThan(plotTop() + 40);
  });
});
