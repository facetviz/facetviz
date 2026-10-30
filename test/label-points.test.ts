import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data: ([string, number] | [string, null])[] = [['P0', null], ...Array.from({ length: 6 }, (_, i) => [`P${i + 1}`, 101 + i] as [string, number])];

const labels = (el: HTMLElement) => [...el.querySelectorAll('text')].filter((t) => t.textContent?.startsWith('L1'));
const texts = (el: HTMLElement) => labels(el).map((t) => t.textContent).sort();
const anchorOf = (el: HTMLElement, text: string) => labels(el).find((t) => t.textContent === text)?.getAttribute('text-anchor');

describe('data labels per point', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('labels only the first and last points with a value', () => {
    for (const type of ['column', 'bar', 'line', 'area', 'scatter'] as const) {
      for (const [only, want] of [['ends', ['L101', 'L106']], ['first', ['L101']], ['last', ['L106']]] as const) {
        const el = container(600, 400);
        new FacetViz(el, {
          chart: { animation: false },
          series: [{ type, name: 'Sales', dataLabels: { enabled: true, format: 'L{y}', only }, data }],
        });
        expect(texts(el), `${type} ${only}`).toEqual(want);
      }
    }
  });

  it('places the first and last labels on their own sides', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      series: [{
        type: 'line', name: 'Sales', data,
        dataLabels: { enabled: true, format: 'L{y}', only: 'ends', first: { position: 'left' }, last: { position: 'right' } },
      }],
    });
    expect(anchorOf(el, 'L101')).toBe('end');
    expect(anchorOf(el, 'L106')).toBe('start');
  });

  it('takes a point’s own settings over the series’, showing or hiding its label', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      series: [{
        type: 'line', name: 'Sales', data,
        dataLabels: {
          enabled: true, format: 'L{y}', last: { position: 'right' },
          pointOf: (ctx) => (ctx.x === 'P2' ? { enabled: false } : ctx.x === 'P6' ? { position: 'left' } : null),
        },
      }],
    });
    expect(texts(el)).toEqual(['L101', 'L103', 'L104', 'L105', 'L106']);
    // The point's own wins over the last point's.
    expect(anchorOf(el, 'L106')).toBe('end');
  });

  it('shows one point’s label with the series’ labels off', () => {
    for (const type of ['column', 'line'] as const) {
      const el = container(600, 400);
      new FacetViz(el, {
        chart: { animation: false },
        series: [{ type, name: 'Sales', data, dataLabels: { enabled: false, format: 'L{y}', pointOf: (ctx) => (ctx.x === 'P3' ? { enabled: true } : null), last: { enabled: true } } }],
      });
      expect(texts(el), type).toEqual(['L103', 'L106']);
    }
  });

  it('drops points’ own labels on a small plot', () => {
    const el = container(120, 90);
    new FacetViz(el, {
      chart: { animation: false },
      series: [{ type: 'line', name: 'Sales', data, dataLabels: { enabled: false, format: 'L{y}', pointOf: () => ({ enabled: true }) } }],
    });
    expect(texts(el)).toEqual([]);
  });
});

describe('labels beside their points', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('move the points in so a label left of the first or right of the last stays in the plot', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      series: [{
        type: 'line', name: 'Sales', data,
        dataLabels: { enabled: true, format: 'L{y} a long label', only: 'ends', first: { position: 'left' }, last: { position: 'right' } },
      }],
    });
    const clip = el.querySelector('clipPath rect')!;
    const x0 = Number(clip.getAttribute('x'));
    const x1 = x0 + Number(clip.getAttribute('width'));
    const [first, last] = labels(el).map((t) => Number(t.getAttribute('x')));
    // Text anchored at its end (left label) and start (right label).
    expect(first - 'L101 a long label'.length * 4).toBeGreaterThan(x0);
    expect(last + 'L106 a long label'.length * 4).toBeLessThan(x1);
  });
});
