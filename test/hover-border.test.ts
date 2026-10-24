import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const draw = (hover: object) => {
  const el = container(600, 400);
  new FacetViz(el, {
    chart: { animation: false },
    xAxis: { categories: ['A', 'B'] },
    series: [{ type: 'column', name: 'S', color: '#336699', data: [3, 5], states: { hover } }],
  });
  return el.querySelector('.facet-point') as SVGElement;
};

describe('hover border and scale', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines a hovered point in a darker shade of its color, scales it, and puts it back', () => {
    const bar = draw({ borderWidth: 2, scale: 1.04 });
    bar.dispatchEvent(new MouseEvent('mouseenter'));
    expect(bar.style.stroke).toContain('color-mix');
    expect(bar.style.strokeWidth).toBe('2');
    expect(bar.style.transform).toBe('scale(1.04)');
    bar.dispatchEvent(new MouseEvent('mouseleave'));
    expect(bar.style.stroke).toBe('');
    expect(bar.style.strokeWidth).toBe('');
    expect(bar.style.transform).toBe('');
  });

  it('takes a border color, and draws none by default', () => {
    const named = draw({ borderWidth: 1.5, borderColor: 'rgb(255, 0, 0)' });
    named.dispatchEvent(new MouseEvent('mouseenter'));
    expect(named.style.stroke).toBe('rgb(255, 0, 0)');
    document.body.innerHTML = '';
    const plain = draw({});
    plain.dispatchEvent(new MouseEvent('mouseenter'));
    expect(plain.style.stroke).toBe('');
    expect(plain.style.transform).toBe('');
  });
});
