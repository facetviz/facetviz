/** Draws point markers (circle, square, diamond, triangle) for series. */

import type { Renderer } from '../core/renderer.js';

export interface MarkerSpec {
  symbol: 'circle' | 'square' | 'diamond' | 'triangle';
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export function drawMarker(
  renderer: Renderer,
  parent: SVGGElement,
  cx: number,
  cy: number,
  spec: MarkerSpec,
): SVGElement {
  const { symbol, radius: r, fill, stroke, strokeWidth } = spec;
  const common = { fill, stroke, 'stroke-width': strokeWidth, class: 'jchart-point' };

  switch (symbol) {
    case 'square':
      return renderer.create('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, ...common }, parent);
    case 'diamond':
      return renderer.create('polygon', {
        points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
        ...common,
      }, parent);
    case 'triangle':
      return renderer.create('polygon', {
        points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`,
        ...common,
      }, parent);
    case 'circle':
    default:
      return renderer.create('circle', { cx, cy, r, ...common }, parent);
  }
}
