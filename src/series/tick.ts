/**
 * Tick series: a short line at each point's value, the same width a column
 * would occupy in its category slot -- a bar chart with the fill removed,
 * leaving just the mark. Grouped side-by-side per category like column/bar,
 * but never anchored to a zero baseline (there's no fill whose truncation
 * would mislead), so it reads like a dot plot rather than a bar chart.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import type { Point } from '../core/point.js';
import { drawDataLabel, labelString, LabelPlacement } from './data-label.js';

export class TickSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group(
      { class: `facet-series facet-tick ${this.name}` },
      renderer.root,
    );

    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const maxWidth = Math.max(1, subWidth * 0.9); // leave a little gap between ticks
    const thickness = this.options.lineWidth ?? 4;

    for (const p of this.points) {
      if (p.y === undefined) continue;
      const width =
        p.options.columnWidth ??
        this.options.columnWidth ??
        this.options.size ??
        maxWidth;

      const center = catScale.scale(p.x);
      // Same packed-centering as column: keeps grouped ticks flush together
      // around the category centre instead of spread across fixed-width slots.
      const gap = subWidth - maxWidth;
      const groupWidth = groupCount * width + (groupCount - 1) * gap;
      const start = center - groupWidth / 2 + groupIndex * (width + gap);
      const v = valScale.scale(p.y);
      const color = p.color ?? this.color;

      const coords = inverted
        ? { x1: v, y1: start, x2: v, y2: start + width }
        : { x1: start, y1: v, x2: start + width, y2: v };

      const el = renderer.create(
        'line',
        { ...coords, stroke: color, 'stroke-width': thickness, class: 'facet-point' },
        g,
      );
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      this.drawLabel(ctx, p, start + width / 2, v, inverted);
    }
  }

  private drawLabel(
    ctx: SeriesRenderContext,
    p: Point,
    mid: number,
    v: number,
    inverted: boolean,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
    });
    const gap = 10 + (dl.distance ?? 0);
    const negative = (p.y ?? 0) < 0;
    let place: LabelPlacement;
    if (inverted) {
      place = negative
        ? { x: v - gap, y: mid + 4, anchor: 'end' }
        : { x: v + gap, y: mid + 4, anchor: 'start' };
    } else {
      place = negative
        ? { x: mid, y: v + gap + 4, anchor: 'middle', side: 'down' }
        : { x: mid, y: v - gap, anchor: 'middle' };
    }
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
}
