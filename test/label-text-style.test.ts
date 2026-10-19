import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const chart = (type: 'column' | 'line' | 'pie', dataLabels: Record<string, unknown>) => ({
  chart: { animation: false },
  series: [{ type, name: 'Sales', dataLabels: { enabled: true, format: 'L{y}', ...dataLabels }, data: [['East', 120000], ['West', 98000]] as [string, number][] }],
});

const label = (el: HTMLElement, text: string) => [...el.querySelectorAll('text')].find((t) => t.textContent?.includes(text))!;

describe('data label text styling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws a label bold, italic, underlined and in its own font', () => {
    for (const type of ['column', 'line', 'pie'] as const) {
      const el = container(600, 400);
      new FacetViz(el, chart(type, { fontWeight: 'bold', fontStyle: 'italic', textDecoration: 'underline', fontFamily: 'Georgia, serif' }));
      const t = label(el, 'L120000');
      expect(t.getAttribute('font-weight')).toBe('bold');
      expect(t.getAttribute('font-style')).toBe('italic');
      expect(t.getAttribute('text-decoration')).toBe('underline');
      expect(t.getAttribute('font-family')).toBe('Georgia, serif');
    }
  });

  it('leaves the defaults alone, and keeps markup out of the font', () => {
    const el = container(600, 400);
    new FacetViz(el, chart('column', { fontStyle: 'normal', textDecoration: 'none', fontFamily: 'x;}<y' }));
    const t = label(el, 'L120000');
    expect(t.getAttribute('font-style')).toBeNull();
    expect(t.getAttribute('text-decoration')).toBeNull();
    expect(t.getAttribute('font-family')).toBe('xy');
  });
});
