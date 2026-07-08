/**
 * JChart — the top-level chart controller.
 *
 * Responsibilities:
 *   1. Resolve user options against defaults + plotOptions.
 *   2. Build series objects from the registry.
 *   3. Compute shared layout: stacking, grouping, axis domains, scales.
 *   4. Render one or many panels (Tableau-style small multiples via trellis).
 *   5. Wire tooltips and event callbacks.
 *
 * Heavy layout lives here so individual series stay small and declarative.
 */

import type {
  ChartOptions,
  SeriesOptions,
  AxisOptions,
  ChartType,
  TooltipContext,
  TrellisOptions,
} from './options.js';
import { Renderer } from './renderer.js';
import { Axis, Rect } from './axis.js';
import { NestedAxis } from './nested-axis.js';
import { Tooltip } from './tooltip.js';
import { Legend, LegendItem } from './legend.js';
import { EventEmitter } from './events.js';
import { LinearScale, LogScale, CategoryScale, Scale } from './scale.js';
import { DEFAULT_OPTIONS, LAYOUT, FONTS } from './defaults.js';
import { merge, extent } from './utils.js';
import { paletteColor } from './colors.js';
import { BaseSeries, SeriesRenderContext } from '../series/base.js';
import { createSeries } from '../series/registry.js';
import { drawDataLabel, labelString } from '../series/data-label.js';
import type { Point } from './point.js';

export class JChart {
  readonly container: HTMLElement;
  readonly options: ChartOptions;
  private renderer!: Renderer;
  private tooltip?: Tooltip;
  readonly events = new EventEmitter();
  series: BaseSeries[] = [];
  private colors: string[];
  private width: number;
  private height: number;

  constructor(container: HTMLElement | string, options: ChartOptions) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('JChart: container element not found');
    this.container = el as HTMLElement;
    this.options = this.resolveOptions(options);
    this.colors = this.options.chart?.colors ?? this.options.colors ?? [];
    // Default to the container's width so the chart never overflows its parent.
    this.width = this.options.chart?.width ?? (this.container.clientWidth || 640);
    this.height = this.options.chart?.height ?? 400;
    this.build();
    this.render();
  }

  // -- Option resolution -------------------------------------------------

  private resolveOptions(user: ChartOptions): ChartOptions {
    const merged = merge({} as ChartOptions, DEFAULT_OPTIONS as ChartOptions, user);
    const globalType = merged.chart?.type ?? 'line';
    const plot = merged.plotOptions ?? {};
    merged.series = user.series.map((s) => {
      const type = (s.type ?? globalType) as ChartType;
      return merge(
        {} as SeriesOptions,
        plot.series ?? {},
        plot[type] ?? {},
        { type },
        s,
      );
    });
    return merged;
  }

  // -- Build model -------------------------------------------------------

  private build(): void {
    const categories = this.resolveCategories();
    this.series = this.options.series.map((opts, i) => {
      const s = createSeries(opts.type ?? 'line', opts, categories);
      s.index = i;
      // Dumbbells legend/identity read best as their high-end colour.
      s.color = opts.color ?? opts.highColor ?? paletteColor(this.colors, i);
      return s;
    });
  }

  /** Category labels, from xAxis or the union of point x values. */
  private resolveCategories(): string[] | undefined {
    const xAxis = this.firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    // Numeric x across all series → no categories (continuous axis).
    const allNumeric = this.options.series.every((s) =>
      s.data.every((d) => typeof d === 'number' || (Array.isArray(d) && typeof d[0] === 'number')),
    );
    if (allNumeric) return undefined;
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of this.options.series) {
      for (const d of s.data) {
        const x = this.rawX(d);
        if (x !== undefined && !seen.has(String(x))) {
          seen.add(String(x));
          cats.push(String(x));
        }
      }
    }
    return cats.length ? cats : undefined;
  }

  private rawX(d: unknown): string | number | undefined {
    if (d === null) return undefined;
    if (Array.isArray(d)) return d[0] as string | number;
    if (typeof d === 'object') {
      const o = d as { x?: string | number; name?: string };
      return o.x ?? o.name;
    }
    return undefined;
  }

  private firstAxis(a?: AxisOptions | AxisOptions[]): AxisOptions | undefined {
    return Array.isArray(a) ? a[0] : a;
  }

  // -- Rendering ---------------------------------------------------------

  render(): void {
    if (!this.renderer) {
      this.renderer = new Renderer(this.width, this.height);
      this.renderer.mount(this.container);
    } else {
      this.renderer.clear();
      this.renderer.setSize(this.width, this.height);
    }

    // Background.
    this.renderer.create('rect', {
      x: 0, y: 0, width: this.width, height: this.height,
      fill: this.options.chart?.backgroundColor ?? '#fff',
    }, this.renderer.root);

    if (this.tooltip) this.tooltip.destroy();
    if (this.options.tooltip?.enabled !== false) {
      this.tooltip = new Tooltip(this.container, this.options.tooltip ?? {});
    }

    const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    let top = spacing[0];
    top += this.renderTitles(top);

    // Legend placement: top / bottom (horizontal strip) or left / right
    // (vertical column). Space is reserved on the chosen side.
    const legendItems = this.buildLegendItems();
    const showLegend = this.options.legend?.enabled !== false && legendItems.length > 1;
    const legendPlace = this.legendPlacement();
    const legendVertical = legendPlace === 'left' || legendPlace === 'right';
    let legendReserveH = 0;
    let legendReserveW = 0;
    if (showLegend) {
      if (legendVertical) legendReserveW = Legend.verticalWidth(legendItems);
      else legendReserveH = LAYOUT.legendHeight;
    }

    const outer: Rect = {
      x: spacing[3] + (legendPlace === 'left' ? legendReserveW : 0),
      y: top + (legendPlace === 'top' ? legendReserveH : 0),
      width: this.width - spacing[1] - spacing[3] - legendReserveW,
      height: this.height - top - spacing[2] - legendReserveH,
    };

    // Nested (Tableau hierarchical x-axis) takes precedence over trellis grids.
    const nestedDims = this.firstAxis(this.options.xAxis)?.dimensions;
    const t = this.options.trellis;
    if (this.options.chart?.type === 'butterfly') {
      this.renderButterflyPanel(outer, this.series.filter((s) => s.visible && s.points.length));
    } else if (nestedDims && nestedDims.length >= 1) {
      this.renderNestedPanel(outer, this.series.filter((s) => s.visible && s.points.length), nestedDims);
    } else if (t && (t.columns || t.rows) && t.table !== false) {
      // Tableau-style table: shared axes, dimension names as row/column headers.
      this.renderTrellisTable(outer, t);
    } else {
      // Independent small-multiple panels (or a single panel when no trellis).
      const panels = this.computePanels(outer);
      for (const panel of panels) this.renderPanel(panel);
    }

    // Draw the legend in its reserved area.
    if (showLegend) {
      let lx = outer.x;
      let ly = this.height - spacing[2] - LAYOUT.legendHeight + 12;
      let lw = outer.width;
      let lh = LAYOUT.legendHeight;
      if (legendPlace === 'top') { ly = top + 12; }
      else if (legendPlace === 'left') { lx = spacing[3]; ly = outer.y; lw = legendReserveW; lh = outer.height; }
      else if (legendPlace === 'right') { lx = outer.x + outer.width + 8; ly = outer.y; lw = legendReserveW; lh = outer.height; }
      new Legend({
        renderer: this.renderer,
        items: legendItems,
        options: this.options.legend ?? {},
        x: lx, y: ly, width: lw, height: lh,
        layout: legendVertical ? 'vertical' : 'horizontal',
        onToggle: (i) => this.toggleSeries(i),
      }).render(this.renderer.group({}, this.renderer.root));
    }

    this.events.emit('render', this);
    this.options.chart?.events?.render?.(this);
  }

  private renderTitles(top: number): number {
    let used = 0;
    const title = this.options.title;
    if (title?.text) {
      const x = this.titleX(title.align);
      this.renderer.text(title.text, x, top + 20, {
        'text-anchor': this.anchor(title.align),
        ...FONTS.title,
        ...(title.style as Record<string, string> ?? {}),
      }, this.renderer.root);
      used += LAYOUT.titleHeight;
    }
    const sub = this.options.subtitle;
    if (sub?.text) {
      const x = this.titleX(sub.align);
      this.renderer.text(sub.text, x, top + used + 16, {
        'text-anchor': this.anchor(sub.align),
        ...FONTS.subtitle,
      }, this.renderer.root);
      used += LAYOUT.subtitleHeight;
    }
    return used;
  }

  private titleX(align?: string): number {
    const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    if (align === 'left') return spacing[3];
    if (align === 'right') return this.width - spacing[1];
    return this.width / 2;
  }

  private anchor(align?: string): string {
    return align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  }

  // -- Panels (trellis) --------------------------------------------------

  private computePanels(outer: Rect): PanelSpec[] {
    const t = this.options.trellis;
    const colDim = t?.columns;
    const rowDim = t?.rows;
    if (!colDim && !rowDim) {
      return [{ rect: outer, series: this.series, title: undefined }];
    }
    // Split each series' points by the trellis dimension(s) into panel keys.
    const colVals = colDim ? this.dimensionValues(colDim) : [undefined];
    const rowVals = rowDim ? this.dimensionValues(rowDim) : [undefined];
    const gap = t?.gap ?? 24;
    const pw = (outer.width - gap * (colVals.length - 1)) / colVals.length;
    const ph = (outer.height - gap * (rowVals.length - 1)) / rowVals.length;

    const panels: PanelSpec[] = [];
    rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        const rect: Rect = {
          x: outer.x + ci * (pw + gap),
          y: outer.y + ri * (ph + gap),
          width: pw,
          height: ph,
        };
        const series = this.series.map((s) => s.filterByDimensions({ [colDim ?? '']: cv, [rowDim ?? '']: rv }));
        const title = [cv, rv].filter((v) => v !== undefined).join(' · ');
        panels.push({ rect, series, title });
      });
    });
    return panels;
  }

  private dimensionValues(dim: string): Array<string | number> {
    const seen = new Set<string>();
    const out: Array<string | number> = [];
    for (const s of this.series) {
      for (const p of s.points) {
        const v = p.options[dim];
        if (v !== undefined && !seen.has(String(v))) {
          seen.add(String(v));
          out.push(v as string | number);
        }
      }
    }
    return out;
  }

  private renderPanel(panel: PanelSpec): void {
    const visible = panel.series.filter((s) => s.visible && s.points.length);
    if (!visible.length) return;

    const cartesian = visible.some((s) => s.capabilities().cartesian);
    const inverted = this.isInverted(visible);

    // Panel title (trellis).
    let plot = panel.rect;
    if (panel.title) {
      this.renderer.text(panel.title, plot.x + plot.width / 2, plot.y + 12, {
        'text-anchor': 'middle', ...FONTS.subtitle, 'font-weight': '600',
      }, this.renderer.root);
      plot = { ...plot, y: plot.y + 20, height: plot.height - 20 };
    }

    if (!cartesian) {
      this.renderPolarPanel(plot, visible);
      return;
    }

    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yOpts = this.firstAxis(this.options.yAxis) ?? {};

    // Axis placement: y can move to the right, x to the top (Highcharts-style
    // `opposite`). Reserve space only on the side an axis actually occupies, and
    // nothing when the axis is hidden.
    const yRight = !!yOpts.opposite;
    const xTop = !!xOpts.opposite;
    const yReserve = yOpts.visible === false ? 6 : LAYOUT.defaultLeftAxisWidth + (yOpts.title?.text ? 16 : 0);
    const xReserve = xOpts.visible === false ? 6 : LAYOUT.defaultBottomAxisHeight + (xOpts.title?.text ? 22 : 0);
    const padLeft = yRight ? 8 : yReserve;
    const padRight = yRight ? yReserve : 8;
    const padTop = xTop ? xReserve : 6;
    const padBottom = xTop ? 6 : xReserve;
    const axisPlot: Rect = {
      x: plot.x + padLeft,
      y: plot.y + padTop,
      width: plot.width - padLeft - padRight,
      height: plot.height - padTop - padBottom,
    };

    this.computeStacks(visible);
    const { xScale, yScale } = this.buildScales(visible, axisPlot, inverted);
    const group = this.groupInfo(visible);

    // Axes.
    const axisLayer = this.renderer.group({ class: 'jchart-axes' }, this.renderer.root);
    new Axis({ renderer: this.renderer, scale: xScale, position: xTop ? 'top' : 'bottom', plot: axisPlot, options: xOpts, grid: false }).render(axisLayer);
    new Axis({ renderer: this.renderer, scale: yScale, position: yRight ? 'right' : 'left', plot: axisPlot, options: yOpts, grid: true }).render(axisLayer);

    // Series.
    for (const s of visible) {
      const ctx = this.seriesContext(s, axisPlot, xScale, yScale, group, inverted, false);
      s.render(ctx);
    }
  }

  /**
   * Tableau-style trellis table. All cells share one y-scale and one x-scale;
   * the y-axis is labelled only on the leftmost column and the x-axis only on
   * the bottom row. Dimension values become column headers (top) and row
   * headers (right), with the dimension name shown once.
   */
  private renderTrellisTable(outer: Rect, t: TrellisOptions): void {
    const colDim = t.columns;
    const rowDim = t.rows;
    const colVals = colDim ? this.dimensionValues(colDim) : [undefined];
    const rowVals = rowDim ? this.dimensionValues(rowDim) : [undefined];
    const gap = t.gap ?? 14;

    const allVisible = this.series.filter((s) => s.visible && s.points.length);
    const categories = this.currentCategories(allVisible);
    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yOpts = this.firstAxis(this.options.yAxis) ?? {};

    // Shared value domain (so every cell is directly comparable).
    let [vMin, vMax] = this.valueDomain(allVisible);
    if (allVisible.some((s) => ['column', 'bar', 'area', 'areaspline'].includes(s.type))) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }

    // Gutters: header strips + shared axis space.
    const colHeaderH = colDim ? 20 : 0;
    const rowHeaderW = rowDim ? 22 : 0;
    const leftReserve = LAYOUT.defaultLeftAxisWidth + (yOpts.title?.text ? 16 : 0);
    const bottomReserve = LAYOUT.defaultBottomAxisHeight + (xOpts.title?.text ? 18 : 0);

    const gridX = outer.x + leftReserve;
    const gridY = outer.y + colHeaderH;
    const gridW = outer.width - leftReserve - rowHeaderW;
    const gridH = outer.height - colHeaderH - bottomReserve;
    const cellW = (gridW - gap * (colVals.length - 1)) / colVals.length;
    const cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length;

    const headerLayer = this.renderer.group({ class: 'jchart-trellis-headers' }, this.renderer.root);

    // Column headers across the top.
    colVals.forEach((cv, ci) => {
      if (cv === undefined) return;
      const cx = gridX + ci * (cellW + gap) + cellW / 2;
      this.renderer.text(String(cv), cx, outer.y + 13, {
        'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': '600', fill: '#333',
      }, headerLayer);
    });

    // Row headers down the right side (rotated).
    rowVals.forEach((rv, ri) => {
      if (rv === undefined) return;
      const cy = gridY + ri * (cellH + gap) + cellH / 2;
      const rx = outer.x + outer.width - 6;
      const el = this.renderer.text(String(rv), rx, cy, {
        'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': '600', fill: '#333',
      }, headerLayer);
      el.setAttribute('transform', `rotate(90 ${rx} ${cy})`);
    });

    // Each cell.
    rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        const cell: Rect = {
          x: gridX + ci * (cellW + gap),
          y: gridY + ri * (cellH + gap),
          width: cellW,
          height: cellH,
        };
        const filter: Record<string, unknown> = {};
        if (colDim) filter[colDim] = cv;
        if (rowDim) filter[rowDim] = rv;
        const cellSeries = this.series
          .map((s) => s.filterByDimensions(filter))
          .filter((s) => s.visible && s.points.length);

        // Cell background for the "table" grid look.
        this.renderer.create('rect', {
          ...cell, fill: 'none', stroke: '#e6e6e6', 'stroke-width': 1,
        }, this.renderer.root);

        const xScale = categories
          ? new CategoryScale({ categories, range: [cell.x, cell.x + cell.width] })
          : new LinearScale({ domain: this.xNumericDomain(cellSeries.length ? cellSeries : allVisible), range: [cell.x, cell.x + cell.width] });
        const yScale = this.valueScale(yOpts, [vMin, vMax], [cell.y + cell.height, cell.y]);

        const axisLayer = this.renderer.group({ class: 'jchart-axes' }, this.renderer.root);
        const isLeft = ci === 0;
        const isBottom = ri === rowVals.length - 1;

        // Y axis: labelled on the left column, gridlines only elsewhere.
        new Axis({
          renderer: this.renderer, scale: yScale, position: 'left', plot: cell, grid: true,
          options: isLeft
            ? { ...yOpts, title: undefined }
            : { labels: { enabled: false }, lineWidth: 0 },
        }).render(axisLayer);

        // X axis: labelled on the bottom row only.
        new Axis({
          renderer: this.renderer, scale: xScale, position: 'bottom', plot: cell, grid: false,
          options: isBottom ? { ...xOpts, title: undefined } : { labels: { enabled: false }, lineWidth: 0 },
        }).render(axisLayer);

        if (!cellSeries.length) return;
        this.computeStacks(cellSeries);
        const group = this.groupInfo(cellSeries);
        for (const s of cellSeries) {
          const ctx = this.seriesContext(s, cell, xScale, yScale, group, false, false);
          s.render(ctx);
        }
      });
    });

    // Shared axis titles, drawn once for the whole table.
    if (yOpts.title?.text) {
      const x = outer.x + 12;
      const y = gridY + gridH / 2;
      this.renderer.text(yOpts.title.text, x, y, {
        'text-anchor': 'middle', transform: `rotate(-90 ${x} ${y})`, ...FONTS.axisTitle,
      }, this.renderer.root);
    }
    if (xOpts.title?.text) {
      this.renderer.text(xOpts.title.text, gridX + gridW / 2, outer.y + outer.height - 2, {
        'text-anchor': 'middle', ...FONTS.axisTitle,
      }, this.renderer.root);
    }
  }

  private renderPolarPanel(plot: Rect, visible: BaseSeries[]): void {
    // Pie/radial: no shared scales; dummy scales satisfy the interface.
    const dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    for (const s of visible) {
      const ctx = this.seriesContext(s, plot, dummy, dummy, { count: 1, index: new Map() }, false, true);
      s.render(ctx);
    }
  }

  // -- Nested (Tableau hierarchical x-axis) ------------------------------

  private renderNestedPanel(outer: Rect, visible: BaseSeries[], dims: string[]): void {
    if (!visible.length) return;
    const agg = this.firstAxis(this.options.xAxis)?.aggregate ?? 'sum';
    const { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;

    // Series carrying only their aggregated leaf points.
    const aggSeries = visible.map((s) => s.withPoints(seriesPoints.get(s.index) ?? []));

    // Reserve axis space. In split mode (opposite) the innermost dimension is
    // labelled at the bottom while the outer grouping dimensions sit on top.
    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yTitle = !!this.firstAxis(this.options.yAxis)?.title?.text;
    const split = !!xOpts.opposite;
    const rowH = 18;
    const leftReserve = LAYOUT.defaultLeftAxisWidth + (yTitle ? 16 : 0);
    const bottomReserve = LAYOUT.tickLength + (split ? 1 : dims.length) * rowH + 12;
    const topReserve = split ? LAYOUT.tickLength + (dims.length - 1) * rowH + 8 : 6;
    const plot: Rect = {
      x: outer.x + leftReserve,
      y: outer.y + topReserve,
      width: outer.width - leftReserve - 8,
      height: outer.height - topReserve - bottomReserve,
    };

    const xScale = new CategoryScale({ categories: keys, range: [plot.x, plot.x + plot.width] });
    let [vMin, vMax] = this.valueDomain(aggSeries);
    vMin = Math.min(vMin, 0);
    vMax = Math.max(vMax, 0);
    const yScale = this.valueScale(this.firstAxis(this.options.yAxis) ?? {}, [vMin, vMax], [plot.y + plot.height, plot.y]);

    const axisLayer = this.renderer.group({ class: 'jchart-axes' }, this.renderer.root);
    new Axis({ renderer: this.renderer, scale: yScale, position: 'left', plot, options: this.firstAxis(this.options.yAxis) ?? {}, grid: true }).render(axisLayer);
    new NestedAxis({ renderer: this.renderer, scale: xScale, plot, leaves, keys, position: split ? 'split' : 'bottom' }).render(axisLayer);

    const group = this.groupInfo(aggSeries);
    for (const s of aggSeries) {
      const ctx = this.seriesContext(s, plot, xScale, yScale, group, false, false);
      s.render(ctx);
    }
  }

  // -- Butterfly (tornado) ----------------------------------------------

  /**
   * Two series drawn back-to-back around a central category axis: the first
   * grows leftward, the second rightward, sharing one value scale so the halves
   * are directly comparable (population pyramids, before/after tornadoes).
   */
  private renderButterflyPanel(outer: Rect, visible: BaseSeries[]): void {
    const pair = visible.slice(0, 2);
    if (pair.length < 2) { // fall back to a single centred column chart
      const panels = this.computePanels(outer);
      for (const p of panels) this.renderPanel(p);
      return;
    }
    const [leftS, rightS] = pair;
    const categories = this.currentCategories(pair) ?? [];
    const yOpts = this.firstAxis(this.options.yAxis) ?? {};

    // Shared value maximum across both series → symmetric halves.
    let maxVal = 0;
    for (const s of pair) for (const p of s.points) maxVal = Math.max(maxVal, p.y ?? 0);
    maxVal = yOpts.max ?? (maxVal || 1);

    // Reserve: bottom for the two value axes, a central gutter for category names.
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;
    const gutter = 84;
    const plot: Rect = { x: outer.x, y: outer.y + 6, width: outer.width, height: outer.height - bottomReserve - 6 };
    const halfW = (plot.width - gutter) / 2;
    const leftZeroX = plot.x + halfW;       // value 0 for the left series (inner edge)
    const rightZeroX = plot.x + halfW + gutter; // value 0 for the right series
    const centerX = (leftZeroX + rightZeroX) / 2;

    const catScale = new CategoryScale({ categories, range: [plot.y, plot.y + plot.height] });
    // Value scales: 0 at the inner edge, maxVal at the outer edge of each half.
    const leftVal = new LinearScale({ domain: [0, maxVal], range: [leftZeroX, plot.x] });
    const rightVal = new LinearScale({ domain: [0, maxVal], range: [rightZeroX, plot.x + plot.width] });

    const axisLayer = this.renderer.group({ class: 'jchart-axes' }, this.renderer.root);
    // Two mirrored value axes along the bottom.
    new Axis({ renderer: this.renderer, scale: leftVal, position: 'bottom', grid: false,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height }, options: { ...yOpts, title: undefined } }).render(axisLayer);
    new Axis({ renderer: this.renderer, scale: rightVal, position: 'bottom', grid: false,
      plot: { x: rightZeroX, y: plot.y, width: halfW, height: plot.height }, options: { ...yOpts, title: undefined } }).render(axisLayer);

    // Category names down the central gutter.
    const band = catScale.bandwidth();
    for (const cat of categories) {
      const cy = catScale.scale(cat) + 4;
      this.renderer.text(cat, centerX, cy, { 'text-anchor': 'middle', ...FONTS.axisLabel }, axisLayer);
    }

    // Series titles above each half.
    this.renderer.text(leftS.name, plot.x + halfW / 2, outer.y + outer.height - 4, { 'text-anchor': 'middle', ...FONTS.axisTitle }, axisLayer);
    this.renderer.text(rightS.name, rightZeroX + halfW / 2, outer.y + outer.height - 4, { 'text-anchor': 'middle', ...FONTS.axisTitle }, axisLayer);

    this.drawButterflySide(leftS, catScale, leftVal, leftZeroX, band, 'left');
    this.drawButterflySide(rightS, catScale, rightVal, rightZeroX, band, 'right');
  }

  private drawButterflySide(
    s: BaseSeries, catScale: CategoryScale, valScale: Scale, zeroX: number, band: number,
    side: 'left' | 'right',
  ): void {
    const g = this.renderer.group({ class: `jchart-series jchart-butterfly ${s.name}` }, this.renderer.root);
    const barH = band * 0.8;
    for (const p of s.points) {
      if (p.y === undefined) continue;
      const vx = valScale.scale(p.y);
      const rect = {
        x: Math.min(zeroX, vx), y: catScale.scale(p.x) - barH / 2,
        width: Math.max(1, Math.abs(vx - zeroX)), height: barH,
      };
      const el = this.renderer.create('rect', { ...rect, fill: p.color ?? s.color, class: 'jchart-point' }, g);
      this.bindTooltip(el, s, p);
      el.addEventListener('click', (e) => this.handlePointEvent('click', s, p, e));
      el.addEventListener('mouseover', (e) => this.handlePointEvent('mouseOver', s, p, e));
      el.addEventListener('mouseout', (e) => this.handlePointEvent('mouseOut', s, p, e));

      const dl = s.options.dataLabels;
      if (dl?.enabled) {
        const text = labelString(dl, { x: p.x, y: p.y, point: p.options, series: s.name });
        const outside = (dl.position ?? 'outside') !== 'inside';
        const lx = side === 'left'
          ? (outside ? rect.x - 4 : rect.x + 4)
          : (outside ? rect.x + rect.width + 4 : rect.x + rect.width - 4);
        drawDataLabel(this.renderer, g, text,
          { x: lx, y: rect.y + barH / 2 + 4, anchor: side === 'left' ? (outside ? 'end' : 'start') : (outside ? 'start' : 'end') }, dl);
      }
    }
  }

  /**
   * Collapse each series' points into one aggregated value per unique
   * combination of `dims`. Leaves are ordered so that outer dimensions form
   * contiguous groups (first-seen order per level), matching Tableau.
   */
  private buildNested(
    visible: BaseSeries[],
    dims: string[],
    agg: 'sum' | 'avg' | 'count' | 'min' | 'max',
  ): { leaves: string[][]; keys: string[]; seriesPoints: Map<number, Point[]> } {
    // First-seen order for each dimension value, per level.
    const order: Array<Map<string, number>> = dims.map(() => new Map());
    const tuples = new Map<string, string[]>();
    for (const s of visible) {
      for (const p of s.points) {
        const tuple = dims.map((d) => String(p.options[d] ?? ''));
        tuple.forEach((v, lvl) => {
          if (!order[lvl].has(v)) order[lvl].set(v, order[lvl].size);
        });
        tuples.set(tuple.join('\u0000'), tuple);
      }
    }
    const leaves = [...tuples.values()].sort((a, b) => {
      for (let lvl = 0; lvl < dims.length; lvl++) {
        const d = order[lvl].get(a[lvl])! - order[lvl].get(b[lvl])!;
        if (d !== 0) return d;
      }
      return 0;
    });
    const keys = leaves.map((l) => l.join('\u0000'));
    const keyIndex = new Map(keys.map((k, i) => [k, i]));

    const seriesPoints = new Map<number, Point[]>();
    for (const s of visible) {
      const buckets = new Map<string, number[]>();
      for (const p of s.points) {
        const key = dims.map((d) => String(p.options[d] ?? '')).join('\u0000');
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p.y ?? 0);
      }
      const pts: Point[] = [];
      for (const [key, vals] of buckets) {
        const i = keyIndex.get(key)!;
        pts.push({
          x: key,
          index: i,
          y: this.aggregate(vals, agg),
          name: leaves[i].join(' / '),
          options: { y: this.aggregate(vals, agg) },
        });
      }
      pts.sort((a, b) => a.index - b.index);
      seriesPoints.set(s.index, pts);
    }
    return { leaves, keys, seriesPoints };
  }

  private aggregate(vals: number[], mode: 'sum' | 'avg' | 'count' | 'min' | 'max'): number {
    if (!vals.length) return 0;
    switch (mode) {
      case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'count': return vals.length;
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      default: return vals.reduce((a, b) => a + b, 0);
    }
  }

  private isInverted(visible: BaseSeries[]): boolean {
    if (this.options.chart?.inverted) return true;
    return visible.some((s) => s.type === 'bar');
  }

  // -- Scales ------------------------------------------------------------

  private buildScales(visible: BaseSeries[], plot: Rect, inverted: boolean): { xScale: Scale; yScale: Scale } {
    const categories = this.currentCategories(visible);
    const xAxisOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yAxisOpts = this.firstAxis(this.options.yAxis) ?? {};

    // Value domain across visible series.
    let [vMin, vMax] = this.valueDomain(visible);
    const includeZero = visible.some((s) => ['column', 'bar', 'area', 'areaspline'].includes(s.type));
    if (includeZero) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }

    const catScale = (range: [number, number], reversed?: boolean) =>
      categories
        ? new CategoryScale({ categories, range, reversed })
        : new LinearScale({ domain: this.xNumericDomain(visible), range, ...(reversed ? { reversed } : {}) });

    if (inverted) {
      // Horizontal bars: value on x (bottom), categories on y (left).
      const xScale = this.valueScale(xAxisOpts, [vMin, vMax], [plot.x, plot.x + plot.width]);
      const yScale = categories
        ? new CategoryScale({ categories, range: [plot.y, plot.y + plot.height] })
        : new LinearScale({ domain: this.xNumericDomain(visible), range: [plot.y + plot.height, plot.y] });
      return { xScale, yScale };
    }

    const xScale = catScale([plot.x, plot.x + plot.width], xAxisOpts.reversed);
    const yScale = this.valueScale(yAxisOpts, [vMin, vMax], [plot.y + plot.height, plot.y]);
    return { xScale, yScale };
  }

  private valueScale(opts: AxisOptions, domain: [number, number], range: [number, number]): Scale {
    const min = opts.min ?? domain[0];
    const max = opts.max ?? domain[1];
    if (opts.type === 'log') return new LogScale({ domain: [min, max], range });
    return new LinearScale({ domain: [min, max], range, tickCount: opts.tickCount });
  }

  private valueDomain(visible: BaseSeries[]): [number, number] {
    const mins: number[] = [];
    const maxs: number[] = [];
    for (const s of visible) {
      if (!s.capabilities().cartesian) continue;
      const [lo, hi] = s.valueExtent();
      mins.push(lo);
      maxs.push(hi);
    }
    if (!mins.length) return [0, 1];
    return [Math.min(...mins), Math.max(...maxs)];
  }

  private xNumericDomain(visible: BaseSeries[]): [number, number] {
    const xs: number[] = [];
    for (const s of visible) for (const p of s.points) if (typeof p.x === 'number') xs.push(p.x);
    return xs.length ? extent(xs) : [0, 1];
  }

  private currentCategories(visible: BaseSeries[]): string[] | undefined {
    const xAxis = this.firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    const allNumeric = visible.every((s) => s.points.every((p) => typeof p.x === 'number'));
    if (allNumeric) return undefined;
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of visible) for (const p of s.points) {
      const key = String(p.x);
      if (!seen.has(key)) { seen.add(key); cats.push(key); }
    }
    return cats;
  }

  // -- Stacking & grouping ----------------------------------------------

  private computeStacks(visible: BaseSeries[]): void {
    // Reset any previous stack computation.
    for (const s of visible) for (const p of s.points) { p.stackLow = undefined; p.stackHigh = undefined; }

    // Group stackable series by (axis, stack key).
    const groups = new Map<string, BaseSeries[]>();
    for (const s of visible) {
      if (!s.options.stacking || !s.capabilities().stackable) continue;
      const key = `${s.options.yAxis ?? 0}:${s.options.stack ?? 'default'}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }

    for (const [, group] of groups) {
      const mode = group[0].options.stacking;
      // Gather category indices present.
      const indices = new Set<number>();
      for (const s of group) for (const p of s.points) indices.add(p.index);

      for (const idx of indices) {
        let posBase = 0;
        let negBase = 0;
        // Percent stacking needs the total magnitude first.
        let total = 0;
        if (mode === 'percent') {
          for (const s of group) {
            const p = s.points.find((pp) => pp.index === idx);
            total += Math.abs(p?.y ?? 0);
          }
        }
        for (const s of group) {
          const p = s.points.find((pp) => pp.index === idx);
          if (!p || p.y === undefined) continue;
          let y = p.y;
          if (mode === 'percent' && total > 0) y = (y / total) * 100;
          if (y >= 0) {
            p.stackLow = posBase;
            p.stackHigh = posBase + y;
            posBase += y;
          } else {
            p.stackHigh = negBase;
            p.stackLow = negBase + y;
            negBase += y;
          }
        }
      }
    }
  }

  private groupInfo(visible: BaseSeries[]): GroupInfo {
    const columnKeys: string[] = [];
    const index = new Map<number, number>();
    for (const s of visible) {
      if (!s.capabilities().grouped) continue;
      const key = s.options.stacking
        ? `stack:${s.options.stack ?? 'default'}`
        : `series:${s.index}`;
      let ci = columnKeys.indexOf(key);
      if (ci === -1) { ci = columnKeys.length; columnKeys.push(key); }
      index.set(s.index, ci);
    }
    return { count: Math.max(1, columnKeys.length), index };
  }

  // -- Series render context --------------------------------------------

  private seriesContext(
    s: BaseSeries,
    plot: Rect,
    xScale: Scale,
    yScale: Scale,
    group: GroupInfo,
    inverted: boolean,
    polar: boolean,
  ): SeriesRenderContext {
    return {
      renderer: this.renderer,
      plot,
      xScale,
      yScale,
      color: s.color,
      colors: this.colors,
      inverted,
      polar,
      groupCount: group.count,
      groupIndex: group.index.get(s.index) ?? 0,
      onPointEvent: (kind, p, dom) => this.handlePointEvent(kind, s, p, dom),
      registerHover: (el, p) => this.bindTooltip(el, s, p),
    };
  }

  private bindTooltip(el: SVGElement, s: BaseSeries, p: Point): void {
    // Hover scale/highlight animation — independent of the tooltip.
    this.applyHover(el, s);

    if (!this.tooltip) return;
    const ctx: TooltipContext = {
      series: s.name,
      x: p.name ?? p.x,
      y: p.y ?? p.high,
      low: p.low,
      high: p.high,
      box: p.box,
      point: p.options,
      color: p.color ?? s.color,
    };
    el.addEventListener('mouseenter', () => this.tooltip!.show(ctx, s.options.tooltip));
    el.addEventListener('mousemove', (e) => this.tooltip!.move(e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => this.tooltip!.hide());
  }

  /**
   * Subtle hover highlight (brightness only). Scaling was reverted — it looked
   * jarring — but remains opt-in via `states.hover.scale` for anyone who wants it.
   */
  private applyHover(el: SVGElement, s: BaseSeries): void {
    const hover = s.options.states?.hover;
    if (hover?.enabled === false) return;
    const scale = hover?.scale; // undefined by default → no scaling
    const brightness = hover?.brightness ?? 0.08;
    const style = el.style as CSSStyleDeclaration & { transformBox: string };
    style.transition = 'filter 0.12s ease';
    el.addEventListener('mouseenter', () => {
      style.filter = `brightness(${1 + brightness})`;
      if (scale) {
        style.transformBox = 'fill-box';
        style.transformOrigin = 'center';
        style.transition = 'transform 0.12s ease, filter 0.12s ease';
        style.transform = `scale(${scale})`;
      }
    });
    el.addEventListener('mouseleave', () => {
      style.filter = '';
      if (scale) style.transform = '';
    });
  }

  private handlePointEvent(kind: 'click' | 'mouseOver' | 'mouseOut', s: BaseSeries, p: Point, dom: Event): void {
    const payload = {
      type: kind,
      seriesName: s.name,
      seriesIndex: s.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      point: p.options,
      domEvent: dom,
    };
    this.events.emit(`point:${kind}`, payload);
    const se = this.options.seriesEvents;
    if (kind === 'click') { se?.click?.(payload); this.options.chart?.events?.click?.(payload); }
    if (kind === 'mouseOver') se?.mouseOver?.(payload);
    if (kind === 'mouseOut') se?.mouseOut?.(payload);
  }

  // -- Legend / visibility ----------------------------------------------

  /** Resolve where the legend sits from its layout/align/verticalAlign options. */
  private legendPlacement(): 'top' | 'bottom' | 'left' | 'right' {
    const l = this.options.legend ?? {};
    if (l.layout === 'vertical') return l.align === 'left' ? 'left' : 'right';
    return l.verticalAlign === 'top' ? 'top' : 'bottom';
  }

  /** True when the legend represents the points of a single non-cartesian
   *  series (pie / donut / radial bar) rather than one item per series. */
  private isPointLegend(): boolean {
    const first = this.series[0];
    return this.series.length === 1 && !!first && !first.capabilities().cartesian;
  }

  private buildLegendItems(): LegendItem[] {
    const first = this.series[0];
    if (this.isPointLegend() && first) {
      return first.points.map((p, i) => ({
        label: String(p.name ?? p.x),
        color: p.color ?? paletteColor(this.colors, i),
        visible: !first.hiddenPoints.has(p.index),
      }));
    }
    return this.series.map((s) => ({ label: s.name, color: s.color, visible: s.visible }));
  }

  private toggleSeries(index: number): void {
    // Point-legend charts toggle an individual slice/ring; others toggle a series.
    if (this.isPointLegend()) {
      const first = this.series[0];
      const p = first.points[index];
      if (!p) return;
      if (first.hiddenPoints.has(p.index)) first.hiddenPoints.delete(p.index);
      else first.hiddenPoints.add(p.index);
      this.options.seriesEvents?.legendItemClick?.({ series: String(p.name ?? p.x), visible: !first.hiddenPoints.has(p.index) });
      this.render();
      return;
    }
    const s = this.series[index];
    if (!s) return;
    s.visible = !s.visible;
    this.options.seriesEvents?.legendItemClick?.({ series: s.name, visible: s.visible });
    this.render();
  }

  // -- Public API --------------------------------------------------------

  /** Register a chart/point event callback. Returns an unsubscribe fn. */
  on(event: string, listener: (payload: unknown) => void): () => void {
    return this.events.on(event, listener);
  }

  /** Replace all series data and re-render. */
  update(options: Partial<ChartOptions>): void {
    Object.assign(this.options, merge(this.options, options as ChartOptions));
    if (options.series) this.build();
    this.render();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.render();
  }

  destroy(): void {
    this.tooltip?.destroy();
    this.events.clear();
    this.renderer?.root.remove();
  }
}

interface PanelSpec {
  rect: Rect;
  series: BaseSeries[];
  title?: string;
}

interface GroupInfo {
  count: number;
  index: Map<number, number>;
}
