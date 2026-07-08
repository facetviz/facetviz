/** Renders a single axis (line, grid, ticks, labels, title) from a scale. */

import type { Renderer } from './renderer.js';
import type { Scale } from './scale.js';
import type { AxisOptions } from './options.js';
import { CategoryScale } from './scale.js';
import { FONTS, LAYOUT } from './defaults.js';
import { formatString } from './utils.js';

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
    const group = renderer.group({ class: `jchart-axis jchart-axis-${position}` }, parent);
    const ticks = scale.ticks();
    const isCategory = scale instanceof CategoryScale;

    // Plot bands sit behind everything else in the axis layer.
    this.drawPlotBands(group);

    // Axis baseline.
    if (options.lineWidth !== 0) {
      const line = this.axisLineCoords();
      renderer.create('line', {
        ...line,
        stroke: options.lineColor ?? '#ccd6eb',
        'stroke-width': options.lineWidth ?? 1,
      }, group);
    }

    const labelsEnabled = options.labels?.enabled !== false;
    const gridColor = options.gridLineColor ?? '#e6e6e6';
    const gridWidth = options.gridLineWidth ?? (this.horizontal ? 0 : 1);

    for (const tick of ticks) {
      const pos = scale.scale(tick);

      // Gridline across the plot (skip for category centres unless asked).
      if (this.cfg.grid && gridWidth > 0 && !isCategory) {
        this.drawGridLine(group, pos, gridColor, gridWidth);
      }

      // Tick mark.
      this.drawTick(group, pos, options.lineColor ?? '#ccd6eb');

      // Label.
      if (labelsEnabled) {
        this.drawLabel(group, pos, this.labelText(scale, tick), options);
      }
    }

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
      renderer.create('rect', { ...rect, fill: band.color ?? 'rgba(70,130,180,0.12)', stroke: 'none', class: 'jchart-plotband' }, g);
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
        class: 'jchart-plotline',
      }, g);
      if (line.label?.text) {
        const lx = this.horizontal ? pos + 4 : plot.x + plot.width - 4;
        const ly = this.horizontal ? plot.y + 12 : pos - 4;
        renderer.text(line.label.text, lx, ly, {
          ...FONTS.axisLabel,
          fill: line.label.color ?? line.color ?? '#e63946',
          'text-anchor': this.horizontal ? 'start' : 'end',
        }, g);
      }
    }
  }

  private labelText(scale: Scale, tick: number | string): string {
    const opts = this.cfg.options.labels;
    if (opts?.formatter) return opts.formatter(tick);
    const base = scale.tickLabel(tick);
    if (opts?.format) return formatString(opts.format, { value: base });
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
    const style = { ...FONTS.axisLabel, ...(options.labels?.style ?? {}) };
    const rotation = options.labels?.rotation;
    let x = 0;
    let y = 0;
    let anchor = 'middle';
    let baseline = 'middle';

    switch (position) {
      case 'bottom':
        x = pos;
        y = plot.y + plot.height + LAYOUT.tickLength + 12;
        baseline = 'hanging';
        break;
      case 'top':
        x = pos;
        y = plot.y - LAYOUT.tickLength - 6;
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
    if (this.horizontal) {
      const x = plot.x + plot.width / 2;
      const y = position === 'bottom'
        ? plot.y + plot.height + LAYOUT.axisTitleGap + 16
        : plot.y - LAYOUT.axisTitleGap - 8;
      renderer.text(text, x, y, { 'text-anchor': 'middle', ...style }, g);
    } else {
      const x = position === 'left'
        ? plot.x - LAYOUT.defaultLeftAxisWidth + 2
        : plot.x + plot.width + LAYOUT.defaultLeftAxisWidth - 2;
      const y = plot.y + plot.height / 2;
      const rot = position === 'left' ? -90 : 90;
      renderer.text(text, x, y, { 'text-anchor': 'middle', transform: `rotate(${rot} ${x} ${y})`, ...style }, g);
    }
  }
}
