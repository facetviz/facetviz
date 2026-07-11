/**
 * Shared data-label rendering. Series compute an anchor point + text-anchor for
 * the chosen `position`, then hand off here for consistent styling (colour,
 * font, rotation, optional background chip).
 */

import type { Renderer } from '../core/renderer.js';
import type { DataLabelOptions, LabelContext } from '../core/options.js';
import type { Point } from '../core/point.js';
import type { Pt } from './paths.js';
import { FONTS } from '../core/defaults.js';
import { formatString } from '../core/utils.js';

/**
 * Resolve the label text from `formatter` or the `{token}` format string.
 * Every field on the context is available as a token: `{x}`, `{y}`, `{name}`,
 * `{series}`, `{index}`, `{color}`, `{percentage}`, `{total}`, `{low}`, `{high}`
 * and `{point.<field>}` — each accepting a format spec, e.g. `{y:,.1f}`.
 */
export function labelString(dl: DataLabelOptions, ctx: LabelContext): string {
  if (dl.formatter) return dl.formatter(ctx);
  const data: Record<string, unknown> = {
    ...ctx,
    y: ctx.y ?? '',
    name: ctx.name ?? ctx.point?.name ?? ctx.x,
  };
  return formatString(dl.format ?? '{y}', data);
}

export interface LabelPlacement {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/** Draw a single data label with the series' styling options. */
export function drawDataLabel(
  renderer: Renderer,
  parent: SVGElement,
  text: string,
  place: LabelPlacement,
  dl: DataLabelOptions,
): void {
  if (!text) return;
  const attrs: Record<string, string | number> = {
    'text-anchor': place.anchor,
    ...FONTS.dataLabel,
    fill: dl.color ?? FONTS.dataLabel.fill,
    'font-size': dl.fontSize ?? FONTS.dataLabel['font-size'],
  };
  if (dl.fontWeight) attrs['font-weight'] = dl.fontWeight;
  if (dl.rotation) attrs.transform = `rotate(${dl.rotation} ${place.x} ${place.y})`;

  if (dl.backgroundColor) {
    // Approximate chip sized from the text length.
    const w = text.length * 6.5 + 8;
    const anchorX = place.anchor === 'start' ? place.x - 4 : place.anchor === 'end' ? place.x - w + 4 : place.x - w / 2;
    renderer.create('rect', {
      x: anchorX, y: place.y - 11, width: w, height: 15, rx: 3, fill: dl.backgroundColor,
    }, parent);
  }
  renderer.text(text, place.x, place.y, attrs, parent);
}

/**
 * Draw labels for point-based series (line, area, scatter) at each pixel point,
 * honouring `position` (top/bottom/center/left/right).
 */
export function drawPointLabels(
  renderer: Renderer,
  parent: SVGElement,
  dl: DataLabelOptions | undefined,
  seriesName: string,
  data: Array<{ pt: Pt; p: Point }>,
  seriesColor?: string,
): void {
  if (!dl?.enabled) return;
  const d = dl.distance ?? 0;
  const pos = dl.position ?? 'top';
  const total = data.reduce((sum, { p }) => sum + (p.y ?? 0), 0);
  for (const { pt, p } of data) {
    const text = labelString(dl, {
      x: p.x, y: p.y, point: p.options, series: seriesName,
      name: p.name ?? p.x, index: p.index, color: p.color ?? seriesColor,
      total, percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
    });
    let place: LabelPlacement;
    switch (pos) {
      case 'bottom': place = { x: pt.x, y: pt.y + 16 + d, anchor: 'middle' }; break;
      case 'center': place = { x: pt.x, y: pt.y + 4, anchor: 'middle' }; break;
      case 'left': place = { x: pt.x - 8 - d, y: pt.y + 4, anchor: 'end' }; break;
      case 'right': place = { x: pt.x + 8 + d, y: pt.y + 4, anchor: 'start' }; break;
      default: place = { x: pt.x, y: pt.y - 8 - d, anchor: 'middle' }; // top
    }
    drawDataLabel(renderer, parent, text, place, dl);
  }
}
