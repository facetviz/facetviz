import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

// A log-axis combo whose line label is lifted 11px above the default spot:
// the axis has to rise to the next nice tick when the label would not fit.
const regions = ['Central', 'East', 'South', 'West'];
const combo = (dataLabels: Record<string, unknown>) => ({
  chart: { animation: false },
  yAxis: { type: 'log' as const },
  series: [
    { type: 'column' as const, name: 'Same Day', data: regions.map((r, i) => [r, [27000, 35000, 21000, 32000][i]]) },
    { type: 'column' as const, name: 'Standard', data: regions.map((r, i) => [r, [300000, 400000, 230000, 415907][i]]) },
    {
      type: 'line' as const,
      name: 'Total',
      dataLabels: { enabled: true, ...dataLabels },
      data: regions.map((r, i) => [r, [501240, 691828, 391722, 739814][i]]),
    },
  ],
});

/** Pixels between the plot's top edge and the top of the highest line label. */
function labelClearance(el: HTMLElement): number {
  const clip = el.querySelector('clipPath rect');
  const plotTop = Number(clip?.getAttribute('y'));
  const ys = [...el.querySelectorAll('text')]
    .filter((t) => t.textContent === '739814')
    .map((t) => Number(t.getAttribute('y')));
  return Math.min(...ys) - 11 - plotTop;
}

describe('data-label headroom', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  for (const height of [260, 420, 560, 720]) {
    it(`keeps an offset line label inside a ${height}px-tall log plot`, () => {
      const el = container(700, height);
      new FacetViz(el, combo({ offsetY: -11 }));
      expect(labelClearance(el)).toBeGreaterThanOrEqual(0);
    });
  }
});
