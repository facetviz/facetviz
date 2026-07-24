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
    // Whether gridlines show at all is already decided by the caller's
    // `grid` flag (true only for the value axis, regardless of which side
    // it ends up on) — the width shouldn't second-guess that by defaulting
    // to 0 just because this axis happens to be positioned horizontally
    // (true for the value axis itself on an inverted/bar chart).
    const gridWidth = options.gridLineWidth ?? 1;

    // When a categorical axis is too cramped for every label to fit without
    // overlapping, thin them out (draw every Nth) instead — ticks/gridlines
    // still render for every value, only the label text skips. Left alone
    // when the caller already rotated labels to make room.
    let labelStep = Math.max(1, options.labels?.step ?? 1);
    let labelRotation = options.labels?.rotation ?? 0;
    if (isCategory && labelsEnabled && this.horizontal) {
      const band = scale.bandwidth();
      if (band > 0) {
        const style = this.labelStyle();
        const widest = ticks.reduce(
          (m: number, t) =>
            Math.max(m, renderer.measureText(this.labelText(scale, t), style).width),
          0,
        );
        if (options.labels?.rotation === undefined) {
          const candidates = options.labels?.autoRotation ?? [0];
          labelRotation =
            candidates.find((rotation) => {
              const rad = (Math.abs(rotation) * Math.PI) / 180;
              const projected =
                Math.cos(rad) * widest +
                Math.sin(rad) * (parseFloat(style["font-size"] ?? "11") || 11);
              return projected + 6 <= band * labelStep;
            }) ?? candidates[candidates.length - 1] ?? 0;
        }
        const rad = (Math.abs(labelRotation) * Math.PI) / 180;
        const projected =
          Math.cos(rad) * widest +
          Math.sin(rad) * (parseFloat(style["font-size"] ?? "11") || 11);
        if (projected + 6 > band * labelStep)
          labelStep = Math.ceil((projected + 6) / band);
      }
    }

    ticks.forEach((tick, i) => {
      const pos = scale.scale(tick);

      // Gridline across the plot — skipped for category centres unless the
      // caller explicitly set `gridLineWidth` (a category scale never gets
      // "nice" numeric ticks to derive a default from, so it stays opt-in).
      if (
        this.cfg.grid &&
        gridWidth > 0 &&
        (!isCategory || options.gridLineWidth)
      ) {
        this.drawGridLine(group, pos, gridColor, gridWidth);
      }

      // Tick mark.
      if (options.ticks !== false) this.drawTick(group, pos, axisColor);

      // Label.
      if (labelsEnabled && i % labelStep === 0) {
        this.drawLabel(
          group,
          pos,
          this.labelText(scale, tick),
          options,
          labelRotation,
        );
      }
    });

    // Plot lines drawn above the grid (and above bands) — but still below
    // the series, which paint after the whole axis layer. Lines flagged
    // `zIndex: 'above'` are skipped here; `renderAbove` draws those instead.
    this.drawPlotLines(group, 'below');

    if (options.title?.text && options.title.enabled !== false)
      this.drawTitle(group, options.title.text);
  }

  /**
   * Re-draws only the `zIndex: 'above'` plotLines, into a group the caller
   * appends after the series so they paint on top of the data instead of
   * under it. No-op (and no group created) when there are none.
   */
  renderAbove(parent: SVGGElement): void {
    const { options, position, renderer } = this.cfg;
    if (options.visible === false) return;
    if (!(options.plotLines ?? []).some((l) => l.zIndex === 'above')) return;
    const group = renderer.group({ class: `facet-axis-above facet-axis-${position}` }, parent);
    this.drawPlotLines(group, 'above');
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
        const align = band.label.align ?? 'left';
        const x = align === 'center'
          ? rect.x + rect.width / 2
          : align === 'right'
            ? rect.x + rect.width - 4
            : rect.x + 4;
        renderer.text(band.label.text, x, rect.y + 12, {
          ...FONTS.axisLabel,
          fill: band.label.color ?? '#666',
          'text-anchor': align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start',
        }, g);
      }
    }
  }

  /**
   * Reference lines at fixed axis values (horizontal or vertical). `which`
   * selects the subset to draw: lines default to `'below'` (drawn as part
   * of the axis, under the series) unless `zIndex: 'above'` is set.
   */
  private drawPlotLines(g: SVGGElement, which: 'above' | 'below'): void {
    const { renderer, scale, plot } = this.cfg;
    for (const line of this.cfg.options.plotLines ?? []) {
      if ((line.zIndex === 'above' ? 'above' : 'below') !== which) continue;
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
        // the edge. `align` picks the horizontal position along the line;
        // `verticalAlign` ('above'/'below', default 'above') picks which
        // side of the line the label hugs — for a vertical (x-axis) line,
        // which has no "above/below the line", it instead means near the
        // top/bottom of the plot.
        const estW = line.label.text.length * 6.2 + 6;
        const vAlign = line.label.verticalAlign ?? 'above';
        let lx: number, ly: number, anchor: 'start' | 'middle' | 'end';
        if (this.horizontal) {
          const align = line.label.align;
          if (align === 'left') {
            lx = pos - 4;
            anchor = 'end';
          } else if (align === 'right') {
            lx = pos + 4;
            anchor = 'start';
          } else if (align === 'center') {
            lx = pos;
            anchor = 'middle';
          } else {
            // No explicit side: flip to whichever has room.
            const fitsRight = pos + 4 + estW <= plot.x + plot.width;
            if (fitsRight) {
              lx = pos + 4;
              anchor = 'start';
            } else {
              lx = Math.max(plot.x + estW, pos - 4);
              anchor = 'end';
            }
          }
          ly = vAlign === 'below' ? plot.y + plot.height - 6 : plot.y + 12;
        } else {
          const align = line.label.align ?? 'right';
          if (align === 'left') {
            lx = plot.x + 4;
            anchor = 'start';
          } else if (align === 'center') {
            lx = plot.x + plot.width / 2;
            anchor = 'middle';
          } else {
            lx = plot.x + plot.width - 4;
            anchor = 'end';
          }
          const target = vAlign === 'below' ? pos + 14 : pos - 4;
          ly = Math.max(plot.y + 10, Math.min(plot.y + plot.height - 4, target));
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

  private labelStyle(): Record<string, string> {
    const customStyle = sanitizeStyle(this.cfg.options.labels?.style);
    const style: Record<string, string> = { ...FONTS.axisLabel, ...customStyle };
    const shortSide = Math.min(this.cfg.plot.width, this.cfg.plot.height);
    if (!customStyle["font-size"]) {
      if (shortSide < 120) style["font-size"] = "9px";
      else if (shortSide < 220) style["font-size"] = "10px";
    }
    return style;
  }

  private fitLabel(text: string, style: Record<string, string>): string | undefined {
    const maxWidth = this.cfg.options.labels?.maxWidth;
    if (!maxWidth || this.cfg.renderer.measureText(text, style).width <= maxWidth)
      return text;
    if (this.cfg.options.labels?.overflow === "hide") return undefined;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = `${text.slice(0, mid)}…`;
      if (this.cfg.renderer.measureText(candidate, style).width <= maxWidth)
        lo = mid;
      else hi = mid - 1;
    }
    return lo ? `${text.slice(0, lo)}…` : undefined;
  }

  private drawLabel(
    g: SVGGElement,
    pos: number,
    rawText: string,
    options: AxisOptions,
    resolvedRotation?: number,
  ): void {
    const { renderer, plot, position } = this.cfg;
    const style = this.labelStyle();
    const text = this.fitLabel(rawText, style);
    if (text === undefined) return;
    const rotation = resolvedRotation ?? options.labels?.rotation ?? 0;
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
    const style = {
      ...FONTS.axisTitle,
      ...sanitizeStyle(this.cfg.options.title?.style),
    };
    // Place the title just beyond the tick labels so the two never overlap,
    // regardless of how wide/tall the labels are.
    const labelsEnabled = this.cfg.options.labels?.enabled !== false;
    const gap = labelsEnabled ? this.labelExtent() : 0;
    const margin = this.cfg.options.title?.margin ?? (this.horizontal ? 14 : 8);
    const offset = this.cfg.options.title?.offset ?? 0;
    const align = this.cfg.options.title?.align ?? "center";
    const along = align === "start" ? 0 : align === "end" ? 1 : 0.5;
    if (this.horizontal) {
      const x = plot.x + plot.width * along;
      const y = position === 'bottom'
        ? plot.y + plot.height + LAYOUT.tickLength + gap + margin + offset + 8
        : plot.y - LAYOUT.tickLength - gap - margin - offset - 4;
      renderer.text(text, x, y, {
        'text-anchor': align === "start" ? "start" : align === "end" ? "end" : "middle",
        ...style,
      }, g);
    } else {
      const x = position === 'left'
        ? plot.x - LAYOUT.tickLength - 4 - gap - margin - offset
        : plot.x + plot.width + LAYOUT.tickLength + 4 + gap + margin + offset;
      const y = plot.y + plot.height * along;
      const rot = position === 'left' ? -90 : 90;
      renderer.text(text, x, y, {
        'text-anchor': align === "start" ? "start" : align === "end" ? "end" : "middle",
        transform: `rotate(${rot} ${x} ${y})`,
        ...style,
      }, g);
    }
  }

  /**
   * Estimated size of the tick labels along the axis-title direction: the
   * widest label (px) for vertical axes, or the label height for horizontal
   * axes. Used to offset the title clear of the labels.
   */
  labelExtent(): number {
    const { scale, options } = this.cfg;
    const labelStyle = sanitizeStyle(options.labels?.style);
    const fontPx = parseFloat(labelStyle['font-size'] ?? FONTS.axisLabel['font-size'] ?? '11') || 11;
    let maxW = 0;
    for (const t of scale.ticks()) {
      const measured = this.cfg.renderer.measureText(this.labelText(scale, t), {
        ...FONTS.axisLabel,
        ...labelStyle,
      }).width;
      maxW = Math.max(
        maxW,
        options.labels?.maxWidth
          ? Math.min(measured, options.labels.maxWidth)
          : measured,
      );
    }
    const rot = options.labels?.rotation ?? 0;
    if (this.horizontal) {
      // Rotated labels take vertical room proportional to their width.
      return rot ? Math.abs(Math.sin((rot * Math.PI) / 180)) * maxW + fontPx : fontPx + 2;
    }
    return maxW;
  }
}
