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
import { formatString, sanitizeStyle } from '../core/utils.js';

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
  /** Use SVG's true vertical centering when the coordinate is a box centre,
   * or hang the text below the coordinate when it is a box's top edge. */
  verticalAlign?: 'middle' | 'hanging';
  /** Which way from the coordinate the label lies, kept when it is rotated.
   * Unset: read from the anchoring — left or right of an end or start
   * anchor, else down for hanging text and up for text sitting on the
   * coordinate; vertically centred labels turn about their middle. */
  side?: 'up' | 'down' | 'left' | 'right';
}

const SIDES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

function sideOf(place: LabelPlacement): keyof typeof SIDES | null {
  if (place.side) return place.side;
  if (place.anchor === 'start') return 'right';
  if (place.anchor === 'end') return 'left';
  if (place.verticalAlign === 'middle') return null;
  return place.verticalAlign === 'hanging' ? 'down' : 'up';
}

/**
 * A rotated label's anchoring, so it stays on its side of the coordinate
 * instead of turning about its middle into the mark: text running
 * outward starts (or ends) at the coordinate; text running across it is
 * centred, with its glyphs toward the outside.
 */
function turnedPlace(place: LabelPlacement, rotation: number): LabelPlacement {
  const side = sideOf(place);
  if (!side) return place;
  const [dx, dy] = SIDES[side];
  const r = (rotation * Math.PI) / 180;
  // Along the text, and from its baseline down through its glyphs.
  const along = Math.cos(r) * dx + Math.sin(r) * dy;
  const down = -Math.sin(r) * dx + Math.cos(r) * dy;
  if (Math.abs(along) > 0.2) return { ...place, anchor: along > 0 ? 'start' : 'end', verticalAlign: 'middle' };
  return { ...place, anchor: 'middle', verticalAlign: down > 0 ? 'hanging' : undefined };
}

/**
 * The font-size `drawDataLabel` will actually render `dl` at: an explicit
 * `dl.fontSize` scaled and clamped the same way `sanitizeStyle` handles any
 * other caller-supplied `style.fontSize` (see its doc comment), so it tracks
 * `chart.scaleFonts` like the yAxis/legend/title fonts instead of staying
 * frozen at the literal pixel value the caller wrote. Callers that need the
 * rendered size for their own layout math (e.g. pie's label-fit checks)
 * should read it from here rather than `dl.fontSize` directly, so the two
 * never drift apart.
 */
export function dataLabelFontSize(dl: DataLabelOptions | undefined): string {
  return dl?.fontSize
    ? sanitizeStyle({ 'font-size': dl.fontSize })['font-size']
    : FONTS.dataLabel['font-size'];
}

/**
 * A data label's text styling beyond its size and color, as SVG attributes:
 * weight, slant, underline and font. Drawing and measuring a label both use
 * it, so a bold or italic label is measured as drawn.
 */
export function dataLabelTextAttrs(dl: DataLabelOptions | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (dl?.fontWeight) out['font-weight'] = String(dl.fontWeight);
  if (dl?.fontStyle && dl.fontStyle !== 'normal') out['font-style'] = dl.fontStyle;
  if (dl?.textDecoration && dl.textDecoration !== 'none') out['text-decoration'] = dl.textDecoration;
  const family = dl?.fontFamily?.replace(/[;{}<>]/g, '').trim();
  if (family) out['font-family'] = family;
  return out;
}

/**
 * Whether the point at `index` of its series gets a label under
 * `dl.every`: points 0, n, 2n …; every point when unset or below 2.
 */
export function labelEvery(dl: DataLabelOptions | undefined, index: number | undefined): boolean {
  const n = Math.floor(dl?.every ?? 1);
  return !(n > 1) || (index ?? 0) % n === 0;
}

/** The indexes of a series' first and last points with a value (-1: none). */
export interface LabelEnds {
  first: number;
  last: number;
}

export function labelEnds(points: Iterable<Point>): LabelEnds {
  let first = -1;
  let last = -1;
  for (const p of points) {
    if (p.y == null || !Number.isFinite(p.y)) continue;
    if (first < 0 || p.index < first) first = p.index;
    if (p.index > last) last = p.index;
  }
  return { first, last };
}

/** Whether `dl` may label any point: on for the series, or for a point. */
export function labelsWanted(dl: DataLabelOptions | undefined): boolean {
  return !!dl && (!!dl.enabled || !!dl.pointOf || !!dl.first?.enabled || !!dl.last?.enabled);
}

/**
 * The label settings for the point `ctx` is of, or null when it has no
 * label: the series' (`every`, `only`), then `first` / `last` at the
 * series' ends, then `pointOf`'s, each over the one before.
 */
export function pointLabelOptions(
  dl: DataLabelOptions | undefined,
  ctx: LabelContext,
  ends: LabelEnds,
): DataLabelOptions | null {
  if (!dl || !labelsWanted(dl)) return null;
  const at = ctx.index ?? -1;
  const isFirst = at >= 0 && at === ends.first;
  const isLast = at >= 0 && at === ends.last;
  let on = !!dl.enabled && (dl.only
    ? (dl.only !== 'last' && isFirst) || (dl.only !== 'first' && isLast)
    : labelEvery(dl, ctx.index));
  let out: DataLabelOptions = dl;
  for (const own of [isFirst ? dl.first : undefined, isLast ? dl.last : undefined, dl.pointOf?.(ctx)]) {
    if (!own) continue;
    out = { ...out, ...own };
    if (own.enabled != null) on = own.enabled;
  }
  return on ? out : null;
}

/** Draw a single data label with the series' styling options. */
export function drawDataLabel(
  renderer: Renderer,
  parent: SVGElement,
  text: string,
  place: LabelPlacement,
  dl: DataLabelOptions,
  /** The point the label is for, for `dl.colorOf`. */
  ctx?: LabelContext,
): void {
  if (!text) return;
  if (dl.offsetX || dl.offsetY)
    place = { ...place, x: place.x + (dl.offsetX || 0), y: place.y + (dl.offsetY || 0) };
  if (dl.rotation && !dl.align) place = turnedPlace(place, dl.rotation);
  const anchor = dl.align === 'left'
    ? 'start'
    : dl.align === 'right'
      ? 'end'
      : dl.align === 'center'
        ? 'middle'
        : place.anchor;
  const attrs: Record<string, string | number> = {
    'text-anchor': anchor,
    ...FONTS.dataLabel,
    fill: (ctx && dl.colorOf?.(ctx)) || (dl.color ?? FONTS.dataLabel.fill),
    'font-size': dataLabelFontSize(dl),
  };
  if (place.verticalAlign) attrs['dominant-baseline'] = place.verticalAlign;
  Object.assign(attrs, dataLabelTextAttrs(dl));
  if (dl.rotation) attrs.transform = `rotate(${dl.rotation} ${place.x} ${place.y})`;

  if (dl.backgroundColor) {
    // Approximate chip sized from the text length.
    const w = text.length * 6.5 + 8;
    const anchorX = anchor === 'start' ? place.x - 4 : anchor === 'end' ? place.x - w + 4 : place.x - w / 2;
    const chipY = place.verticalAlign === 'middle' ? place.y - 7.5 : place.verticalAlign === 'hanging' ? place.y - 2 : place.y - 11;
    renderer.create('rect', {
      x: anchorX, y: chipY, width: w, height: 15, rx: 3, fill: dl.backgroundColor,
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
  if (!labelsWanted(dl)) return;
  const ends = labelEnds(data.map(({ p }) => p));
  const total = data.reduce((sum, { p }) => sum + (p.y ?? 0), 0);
  for (const { pt, p } of data) {
    const ctx: LabelContext = {
      x: p.x, y: p.y, point: p.options, series: seriesName,
      name: p.name ?? p.x, index: p.index, color: p.color ?? seriesColor,
      total, percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
    };
    // The point's own settings, over the series'.
    const own = pointLabelOptions(dl, ctx, ends);
    if (!own) continue;
    const d = own.distance ?? 0;
    const pos = own.position ?? 'top';
    const text = labelString(own, ctx);
    let place: LabelPlacement;
    switch (pos) {
      // Rotated, a label below the point hangs from just under it.
      case 'bottom': place = own.rotation
        ? { x: pt.x, y: pt.y + 8 + d, anchor: 'middle', side: 'down' }
        : { x: pt.x, y: pt.y + 16 + d, anchor: 'middle' }; break;
      case 'center': place = own.rotation
        ? { x: pt.x, y: pt.y, anchor: 'middle', verticalAlign: 'middle' }
        : { x: pt.x, y: pt.y + 4, anchor: 'middle' }; break;
      case 'left': place = { x: pt.x - 8 - d, y: pt.y + 4, anchor: 'end', side: 'left' }; break;
      case 'right': place = { x: pt.x + 8 + d, y: pt.y + 4, anchor: 'start', side: 'right' }; break;
      default: place = { x: pt.x, y: pt.y - 8 - d, anchor: 'middle' }; // top
    }
    drawDataLabel(renderer, parent, text, place, own, ctx);
  }
}
