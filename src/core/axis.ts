/** Renders a single axis (line, grid, ticks, labels, title) from a scale. */

import type { Renderer } from './renderer.js';
import type { Scale } from './scale.js';
import type { AxisOptions } from './options.js';
import { CategoryScale } from './scale.js';
import { FONTS, LAYOUT } from './defaults.js';
import { THEME } from './theme.js';
import { formatString, sanitizeStyle } from './utils.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AxisPosition = 'bottom' | 'left' | 'top' | 'right';

export interface AxisConfig {
  renderer: Renderer;
  scale: Scale;
  position: AxisPosition;
  plot: Rect;
  options: AxisOptions;
  /** Draw gridlines spanning the plot area. */
  grid?: boolean;
}

export class Axis {
  constructor(private cfg: AxisConfig) {}

  private get horizontal(): boolean {
    return this.cfg.position === 'bottom' || this.cfg.position === 'top';
  }

  render(parent: SVGGElement): void {
    const { renderer, scale, options, position } = this.cfg;
    if (options.visible === false) return;
    const group = renderer.group({ class: `facet-axis facet-axis-${position}` }, parent);
    const ticks = scale.ticks();
    const isCategory = scale instanceof CategoryScale;

    // Plot bands sit behind everything else in the axis layer.
    this.drawPlotBands(group);

    // Axis baseline.
    const axisColor = options.lineColor ?? THEME.axis.lineColor;
    if (options.lineWidth !== 0) {
      const line = this.axisLineCoords();
      renderer.create('line', {
        ...line,
        stroke: axisColor,
        'stroke-width': options.lineWidth ?? 1,
      }, group);
    }

    const labelsEnabled = options.labels?.enabled !== false;
    const gridColor = options.gridLineColor ?? THEME.axis.gridLineColor;
    const gridWidth = options.gridLineWidth ?? (this.horizontal ? 0 : 1);

    // When a categorical axis is too cramped for every label to fit without
    // overlapping, thin them out (draw every Nth) instead — ticks/gridlines
    // still render for every value, only the label text skips. Left alone
    // when the caller already rotated labels to make room.
    let labelStep = 1;
    if (isCategory && labelsEnabled && this.horizontal && !options.labels?.rotation) {
      const band = scale.bandwidth();
      if (band > 0) {
        const maxLen = ticks.reduce((m: number, t) => Math.max(m, this.labelText(scale, t).length), 0);
        const estW = maxLen * 6.2 + 6;
        if (estW > band) labelStep = Math.ceil(estW / band);
      }
    }

    ticks.forEach((tick, i) => {
      const pos = scale.scale(tick);

      // Gridline across the plot (skip for category centres unless asked).
      if (this.cfg.grid && gridWidth > 0 && !isCategory) {
        this.drawGridLine(group, pos, gridColor, gridWidth);
      }

      // Tick mark.
      if (options.ticks !== false) this.drawTick(group, pos, axisColor);

      // Label.
      if (labelsEnabled && i % labelStep === 0) {
        this.drawLabel(group, pos, this.labelText(scale, tick), options);
      }
    });

    // Plot lines drawn above the grid (and above bands).
    this.drawPlotLines(group);

    if (options.title?.text) this.drawTitle(group, options.title.text);
  }

  /** Shaded bands spanning an axis interval (horizontal or vertical). */
  private drawPlotBands(g: SVGGElement): void {
    const { renderer, scale, plot } = this.cfg;
    for (const band of this.cfg.options.plotBands ?? []) {
      const p0 = scale.scale(band.from);
      const p1 = scale.scale(band.to);
      const rect = this.horizontal
        ? { x: Math.min(p0, p1), y: plot.y, width: Math.abs(p1 - p0), height: plot.height }
        : { x: plot.x, y: Math.min(p0, p1), width: plot.width, height: Math.abs(p1 - p0) };
      renderer.create('rect', { ...rect, fill: band.color ?? 'rgba(70,130,180,0.12)', stroke: 'none', class: 'facet-plotband' }, g);
      if (band.label?.text) {
        renderer.text(band.label.text, rect.x + 4, rect.y + 12, {
          ...FONTS.axisLabel, fill: band.label.color ?? '#666', 'text-anchor': 'start',
        }, g);
      }
    }
  }

  /** Reference lines at fixed axis values (horizontal or vertical). */
  private drawPlotLines(g: SVGGElement): void {
    const { renderer, scale, plot } = this.cfg;
    for (const line of this.cfg.options.plotLines ?? []) {
      const pos = scale.scale(line.value);
      const coords = this.horizontal
        ? { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height }
        : { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos };
      renderer.create('line', {
        ...coords,
        stroke: line.color ?? '#e63946',
        'stroke-width': line.width ?? 1.5,
        'stroke-dasharray': line.dashStyle ?? undefined,
        class: 'facet-plotline',
      }, g);
      if (line.label?.text) {
        // Clamp the label to the plot's bounds instead of letting it run off
        // the edge — flip to the line's other side (horizontal axis) or pin
        // the vertical position within the plot (vertical axis) when there
        // isn't room.
        const estW = line.label.text.length * 6.2 + 6;
        let lx: number, ly: number, anchor: 'start' | 'end';
        if (this.horizontal) {
          const fitsRight = pos + 4 + estW <= plot.x + plot.width;
          if (fitsRight) {
            lx = pos + 4;
            anchor = 'start';
          } else {
            lx = Math.max(plot.x + estW, pos - 4);
            anchor = 'end';
          }
          ly = plot.y + 12;
        } else {
          lx = plot.x + plot.width - 4;
          ly = Math.max(plot.y + 10, Math.min(plot.y + plot.height - 4, pos - 4));
          anchor = 'end';
        }
        renderer.text(line.label.text, lx, ly, {
          ...FONTS.axisLabel,
          fill: line.label.color ?? line.color ?? '#e63946',
          'text-anchor': anchor,
        }, g);
      }
    }
  }

  private labelText(scale: Scale, tick: number | string): string {
    const opts = this.cfg.options.labels;
    if (opts?.formatter) return opts.formatter(tick);
    const base = scale.tickLabel(tick);
    // Pass the raw numeric tick so format specs (`{value:,.0f}`) apply on value
    // axes; category ticks stay as their label string.
    if (opts?.format) return formatString(opts.format, { value: typeof tick === 'number' ? tick : base });
    return base;
  }

  private axisLineCoords(): { x1: number; y1: number; x2: number; y2: number } {
    const { plot, position } = this.cfg;
    switch (position) {
      case 'bottom':
        return { x1: plot.x, y1: plot.y + plot.height, x2: plot.x + plot.width, y2: plot.y + plot.height };
      case 'top':
        return { x1: plot.x, y1: plot.y, x2: plot.x + plot.width, y2: plot.y };
      case 'left':
        return { x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.height };
      case 'right':
        return { x1: plot.x + plot.width, y1: plot.y, x2: plot.x + plot.width, y2: plot.y + plot.height };
    }
  }

  private drawGridLine(g: SVGGElement, pos: number, color: string, width: number): void {
    const { renderer, plot } = this.cfg;
    if (this.horizontal) {
      renderer.create('line', { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height, stroke: color, 'stroke-width': width }, g);
    } else {
      renderer.create('line', { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos, stroke: color, 'stroke-width': width }, g);
    }
  }

  private drawTick(g: SVGGElement, pos: number, color: string): void {
    const { renderer, plot, position } = this.cfg;
    const len = LAYOUT.tickLength;
    switch (position) {
      case 'bottom':
        renderer.create('line', { x1: pos, y1: plot.y + plot.height, x2: pos, y2: plot.y + plot.height + len, stroke: color }, g);
        break;
      case 'top':
        renderer.create('line', { x1: pos, y1: plot.y, x2: pos, y2: plot.y - len, stroke: color }, g);
        break;
      case 'left':
        renderer.create('line', { x1: plot.x - len, y1: pos, x2: plot.x, y2: pos, stroke: color }, g);
        break;
      case 'right':
        renderer.create('line', { x1: plot.x + plot.width, y1: pos, x2: plot.x + plot.width + len, y2: pos, stroke: color }, g);
        break;
    }
  }

  private drawLabel(g: SVGGElement, pos: number, text: string, options: AxisOptions): void {
    const { renderer, plot, position } = this.cfg;
    const style: Record<string, string> = { ...FONTS.axisLabel, ...sanitizeStyle(options.labels?.style) };
    // Shrink the label font slightly on a small/cramped plot (a dashboard
    // card, a resizable panel) instead of using the same size as a
    // full-width chart — skipped when the caller set an explicit font-size.
    if (!options.labels?.style?.['font-size']) {
      const shortSide = Math.min(plot.width, plot.height);
      if (shortSide < 120) style['font-size'] = '9px';
      else if (shortSide < 220) style['font-size'] = '10px';
    }
    const rotation = options.labels?.rotation ?? 0;
    let x = 0;
    let y = 0;
    let anchor = 'middle';
    let baseline = 'middle';

    switch (position) {
      case 'bottom':
        x = pos;
        // Rotated labels pivot from a point right below the tick; unrotated ones
        // hang from their top edge.
        y = plot.y + plot.height + LAYOUT.tickLength + (rotation ? 8 : 7);
        baseline = rotation ? 'middle' : 'hanging';
        // Anchor the tick-side end of the label at the tick so it reads cleanly.
        anchor = rotation ? (rotation < 0 ? 'end' : 'start') : 'middle';
        break;
      case 'top':
        x = pos;
        y = plot.y - LAYOUT.tickLength - (rotation ? 8 : 6);
        anchor = rotation ? (rotation < 0 ? 'start' : 'end') : 'middle';
        break;
      case 'left':
        x = plot.x - LAYOUT.tickLength - 4;
        y = pos;
        anchor = 'end';
        break;
      case 'right':
        x = plot.x + plot.width + LAYOUT.tickLength + 4;
        y = pos;
        anchor = 'start';
        break;
    }

    const el = renderer.text(text, x, y, {
      'text-anchor': anchor,
      'dominant-baseline': baseline,
      ...style,
    }, g);
    if (rotation) el.setAttribute('transform', `rotate(${rotation} ${x} ${y})`);
  }

  private drawTitle(g: SVGGElement, text: string): void {
    const { renderer, plot, position } = this.cfg;
    const style = FONTS.axisTitle;
    // Place the title just beyond the tick labels so the two never overlap,
    // regardless of how wide/tall the labels are.
    const labelsEnabled = this.cfg.options.labels?.enabled !== false;
    const gap = labelsEnabled ? this.labelExtent() : 0;
    if (this.horizontal) {
      const x = plot.x + plot.width / 2;
      const y = position === 'bottom'
        ? plot.y + plot.height + LAYOUT.tickLength + gap + 14
        : plot.y - LAYOUT.tickLength - gap - 10;
      renderer.text(text, x, y, { 'text-anchor': 'middle', ...style }, g);
    } else {
      const x = position === 'left'
        ? plot.x - LAYOUT.tickLength - 4 - gap - 8
        : plot.x + plot.width + LAYOUT.tickLength + 4 + gap + 8;
      const y = plot.y + plot.height / 2;
      const rot = position === 'left' ? -90 : 90;
      renderer.text(text, x, y, { 'text-anchor': 'middle', transform: `rotate(${rot} ${x} ${y})`, ...style }, g);
    }
  }

  /**
   * Estimated size of the tick labels along the axis-title direction: the
   * widest label (px) for vertical axes, or the label height for horizontal
   * axes. Used to offset the title clear of the labels.
   */
  labelExtent(): number {
    const { scale, options } = this.cfg;
    const fontPx = parseFloat(options.labels?.style?.['font-size'] ?? FONTS.axisLabel['font-size'] ?? '11') || 11;
    const charW = fontPx * 0.6;
    let maxW = 0;
    for (const t of scale.ticks()) {
      maxW = Math.max(maxW, this.labelText(scale, t).length * charW);
    }
    const rot = options.labels?.rotation ?? 0;
    if (this.horizontal) {
      // Rotated labels take vertical room proportional to their width.
      return rot ? Math.abs(Math.sin((rot * Math.PI) / 180)) * maxW + fontPx : fontPx + 2;
    }
    return maxW;
  }
}
