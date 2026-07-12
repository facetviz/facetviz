/**
 * FacetChart — the top-level chart controller.
 *
 * Responsibilities:
 *   1. Resolve user options against defaults + plotOptions.
 *   2. Build series objects from the registry.
 *   3. Compute shared layout: stacking, grouping, axis domains, scales.
 *   4. Render one or many panels (small multiples via trellis).
 *   5. Wire tooltips and event callbacks.
 *
 * Heavy layout lives here so individual series stay small and declarative.
 */

import type {
  ChartOptions,
  SeriesOptions,
  AxisOptions,
  ChartType,
  TitleOptions,
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
import { merge, extent, niceDateTicks, formatDate, decimateLine } from './utils.js';
import { paletteColor, alpha, shade } from './colors.js';
import { Theme, resolveTheme, applyTheme, THEME } from './theme.js';
import { BaseSeries, SeriesRenderContext } from '../series/base.js';
import { createSeries } from '../series/registry.js';
import { drawDataLabel, labelString } from '../series/data-label.js';
import type { Point } from './point.js';

export class FacetChart {
  readonly container: HTMLElement;
  readonly options: ChartOptions;
  private renderer!: Renderer;
  private tooltip?: Tooltip;
  readonly events = new EventEmitter();
  series: BaseSeries[] = [];
  private colors: string[];
  private theme: Theme;
  private width: number;
  private height: number;
  private resizeObserver?: ResizeObserver;
  /** Play the enter animation on the next render (first render + data updates). */
  private animateNext = true;
  /** Scales + plot captured for drag-zoom. */
  private zoomState?: { plot: Rect; xScale: Scale; yScale: Scale };
  /** Plot + scales of the last cartesian panel (for crosshair). */
  private plotCtx?: { plot: Rect; xScale: Scale; yScale: Scale; inverted: boolean };
  private crosshairEl?: SVGElement;
  private clipSeq = 0;
  /** Saved series/title/xAxis levels for drill-down navigation. */
  private drillStack: Array<{ series: SeriesOptions[]; title?: TitleOptions; xAxis?: AxisOptions | AxisOptions[] }> = [];

  constructor(container: HTMLElement | string, options: ChartOptions) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('FacetChart: container element not found');
    this.container = el as HTMLElement;
    this.options = this.resolveOptions(options);
    this.theme = resolveTheme(this.options.theme);
    // Explicit colours win; otherwise fall back to the theme palette.
    this.colors = this.options.chart?.colors ?? this.options.colors ?? this.theme.colors;
    // Default to the container's width so the chart never overflows its parent.
    this.width = this.options.chart?.width ?? (this.container.clientWidth || 640);
    this.height = this.options.chart?.height ?? 400;
    this.build();
    this.render();
    this.setupReflow();
  }

  /** Re-render to the container's width when it resizes (unless width is fixed). */
  private setupReflow(): void {
    if (this.options.chart?.reflow === false || this.options.chart?.width || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = this.container.clientWidth;
        if (w && Math.abs(w - this.width) > 1) { this.width = w; this.animateNext = false; this.render(); }
      });
    });
    this.resizeObserver.observe(this.container);
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

  /** The axis options at index `i` (for secondary/dual axes). */
  private axisAt(a: AxisOptions | AxisOptions[] | undefined, i: number): AxisOptions {
    if (Array.isArray(a)) return a[i] ?? {};
    return i === 0 ? a ?? {} : {};
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

    // Apply the theme (updates shared FONTS + the live THEME read by axes etc.).
    applyTheme(this.theme);

    // Background.
    this.renderer.create('rect', {
      x: 0, y: 0, width: this.width, height: this.height,
      fill: this.options.chart?.backgroundColor ?? this.theme.backgroundColor,
    }, this.renderer.root);

    if (this.tooltip) this.tooltip.destroy();
    if (this.options.tooltip?.enabled !== false) {
      // Theme tooltip colours as defaults; user tooltip options still win.
      this.tooltip = new Tooltip(this.container, {
        backgroundColor: this.theme.tooltip.backgroundColor,
        borderColor: this.theme.tooltip.borderColor,
        color: this.theme.tooltip.color,
        ...this.options.tooltip,
      });
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

    // Nested (hierarchical x-axis) takes precedence over trellis grids.
    const nestedDims = this.firstAxis(this.options.xAxis)?.dimensions;
    const t = this.options.trellis;
    const chartType = this.options.chart?.type;
    const vis = () => this.series.filter((s) => s.visible && s.points.length);
    if (chartType === 'butterfly') {
      this.renderButterflyPanel(outer, vis());
    } else if (chartType === 'radar') {
      this.renderRadarPanel(outer, vis());
    } else if (chartType === 'marimekko') {
      this.renderMarimekkoPanel(outer, vis());
    } else if (nestedDims && nestedDims.length >= 1) {
      this.renderNestedPanel(outer, this.series.filter((s) => s.visible && s.points.length), nestedDims);
    } else if (t && (t.columns || t.rows) && t.table !== false) {
      // Cross-tab table: shared axes, dimension names as row/column headers.
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

    this.applyAccessibility();
    this.installZoom(outer);
    this.drawDrillUp(outer);
    if (this.animateNext) this.animateEnter();
    this.animateNext = false;

    this.events.emit('render', this);
    this.options.chart?.events?.render?.(this);
  }

  /** Set root ARIA role + a <title>/<desc> for screen readers. */
  private applyAccessibility(): void {
    if (this.options.accessibility?.enabled === false) return;
    const root = this.renderer.root;
    const label = this.options.accessibility?.description
      ?? this.options.title?.text
      ?? `${this.options.chart?.type ?? 'chart'} chart with ${this.series.length} series`;
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = label;
    root.insertBefore(title, root.firstChild);
  }

  /** Enter animation: bars grow from the baseline, lines draw in, the rest fade. */
  private animateEnter(): void {
    const opt = this.options.chart?.animation;
    if (opt === false) return;
    const cfg = typeof opt === 'object' ? opt : {};
    if (cfg.enabled === false || typeof (Element.prototype as { animate?: unknown }).animate !== 'function') return;
    const duration = cfg.duration ?? 600;
    const easing = cfg.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)';
    const inverted = this.isInverted(this.series);

    const groups = this.renderer.root.querySelectorAll<SVGGElement>('.facet-series');
    groups.forEach((g, gi) => {
      const delay = Math.min(gi * 60, 240);
      const cls = g.getAttribute('class') ?? '';
      if (cls.includes('facet-column') || cls.includes('facet-marimekko')) {
        g.querySelectorAll<SVGElement>('rect.facet-point, rect').forEach((r) => {
          r.style.transformBox = 'fill-box';
          r.style.transformOrigin = inverted ? 'left center' : 'center bottom';
          r.animate([{ transform: inverted ? 'scaleX(0)' : 'scaleY(0)' }, { transform: 'none' }], { duration, easing, delay, fill: 'backwards' });
        });
      } else if (cls.includes('facet-line') || cls.includes('facet-arearange') || cls.includes('facet-radar')) {
        g.querySelectorAll<SVGPathElement>('path').forEach((p) => {
          if (p.getAttribute('fill') !== 'none') { p.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, delay, fill: 'backwards' }); return; }
          const len = p.getTotalLength?.() ?? 0;
          if (!len) return;
          p.style.strokeDasharray = `${len}`;
          const anim = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: duration + 200, easing, delay, fill: 'backwards' });
          anim.onfinish = () => { p.style.strokeDasharray = ''; };
        });
      } else {
        g.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration, easing, delay, fill: 'backwards' });
      }
    });
  }

  /** Convert a client X coordinate to the SVG's internal x (accounts for CSS scaling). */
  private localX(clientX: number): number {
    const r = this.renderer.root.getBoundingClientRect();
    return r.width ? (clientX - r.left) * (this.width / r.width) : clientX;
  }

  private localY(clientY: number): number {
    const r = this.renderer.root.getBoundingClientRect();
    return r.height ? (clientY - r.top) * (this.height / r.height) : clientY;
  }

  /**
   * Drag-select on a numeric/datetime x-axis to zoom. Sets the x-axis min/max
   * and re-renders; a "Reset zoom" control restores the full range.
   */
  private installZoom(outer: Rect): void {
    const z = this.options.chart?.zoom;
    const type = typeof z === 'object' ? z.type : z;
    if (!type) return;
    const st = this.zoomState;
    if (!st) return;
    const xScale = st.xScale as Scale & { invert?(p: number): number };
    const yScale = st.yScale as Scale & { invert?(p: number): number };
    // Each axis is zoomable only if it is continuous (has invert, no bands).
    const canX = (type === 'x' || type === 'xy') && !!xScale?.invert && xScale.bandwidth() === 0;
    const canY = (type === 'y' || type === 'xy') && !!yScale?.invert && yScale.bandwidth() === 0;
    if (!canX && !canY) return;
    const plot = st.plot;
    const root = this.renderer.root;

    const overlay = this.renderer.create('rect', {
      x: plot.x, y: plot.y, width: plot.width, height: plot.height,
      fill: 'transparent', style: 'cursor:crosshair', class: 'facet-zoom-overlay',
    }, root);

    const clampX = (v: number) => Math.max(plot.x, Math.min(plot.x + plot.width, v));
    const clampY = (v: number) => Math.max(plot.y, Math.min(plot.y + plot.height, v));
    let startX = 0, startY = 0;
    let band: SVGRectElement | null = null;

    // The selection rect spans the full plot on any axis that isn't being zoomed.
    const bandRect = (x: number, y: number) => ({
      x: canX ? Math.min(startX, x) : plot.x,
      width: canX ? Math.abs(x - startX) : plot.width,
      y: canY ? Math.min(startY, y) : plot.y,
      height: canY ? Math.abs(y - startY) : plot.height,
    });

    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      startX = clampX(this.localX(e.clientX));
      startY = clampY(this.localY(e.clientY));
      band = this.renderer.create('rect', {
        ...bandRect(startX, startY), fill: 'rgba(37,99,235,0.15)', stroke: 'rgba(37,99,235,0.6)',
      }, root) as SVGRectElement;
      const move = (ev: MouseEvent) => {
        const r = bandRect(clampX(this.localX(ev.clientX)), clampY(this.localY(ev.clientY)));
        band!.setAttribute('x', String(r.x)); band!.setAttribute('width', String(r.width));
        band!.setAttribute('y', String(r.y)); band!.setAttribute('height', String(r.height));
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        const endX = clampX(this.localX(ev.clientX)), endY = clampY(this.localY(ev.clientY));
        band?.remove(); band = null;
        const dragX = canX && Math.abs(endX - startX) >= 6;
        const dragY = canY && Math.abs(endY - startY) >= 6;
        if (!dragX && !dragY) return;
        if (dragX) {
          const a = xScale.invert!(Math.min(startX, endX)), b = xScale.invert!(Math.max(startX, endX));
          this.setAxisRange('xAxis', a, b);
        }
        if (dragY) {
          // y range is reversed (larger pixel = smaller value).
          const a = yScale.invert!(Math.max(startY, endY)), b = yScale.invert!(Math.min(startY, endY));
          this.setAxisRange('yAxis', a, b);
        }
        this.animateNext = false; this.render();
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });

    // Reset control when a zoom is active on either axis.
    const xa = this.axisAt(this.options.xAxis, 0);
    const ya = this.axisAt(this.options.yAxis, 0);
    const zoomed = xa.min !== undefined || xa.max !== undefined || ya.min !== undefined || ya.max !== undefined;
    if (zoomed) {
      const g = this.renderer.group({ class: 'facet-zoom-reset', style: 'cursor:pointer' }, root);
      const bx = outer.x + outer.width - 92, by = outer.y + 2;
      this.renderer.create('rect', { x: bx, y: by, width: 90, height: 22, rx: 5, fill: this.theme.tooltip.backgroundColor, stroke: THEME.axis.lineColor }, g);
      this.renderer.text('⟲ Reset zoom', bx + 45, by + 15, { 'text-anchor': 'middle', ...FONTS.axisLabel, fill: this.theme.axis.labelColor }, g);
      g.addEventListener('click', () => {
        this.clearAxisRange('xAxis'); this.clearAxisRange('yAxis');
        this.animateNext = true; this.render();
      });
    }
  }

  /** Set an axis' min/max (single-axis only; leaves multi-axis configs alone). */
  private setAxisRange(axis: 'xAxis' | 'yAxis', min: number, max: number): void {
    const cur = this.options[axis];
    if (Array.isArray(cur)) return;
    this.options[axis] = { ...(cur ?? {}), min, max };
  }

  /** Remove min/max from a single-axis config (used by "Reset zoom"). */
  private clearAxisRange(axis: 'xAxis' | 'yAxis'): void {
    const cur = this.options[axis];
    if (Array.isArray(cur) || !cur) return;
    const { min, max, ...rest } = cur;
    this.options[axis] = rest;
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

  /** Estimated px width of the widest category-axis label. */
  private catLabelWidth(visible: BaseSeries[]): number {
    const cats = this.currentCategories(visible) ?? [];
    return cats.reduce((m, c) => Math.max(m, String(c).length), 0) * 6.6;
  }

  /** Estimated px width of the widest value-axis label. */
  private valueLabelWidth(visible: BaseSeries[], valOpts: AxisOptions): number {
    const [dmin, dmax] = this.valueDomain(visible);
    const fmt = (v: number) => {
      if (valOpts.labels?.formatter) return String(valOpts.labels.formatter(v));
      const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
      return String(r);
    };
    return Math.max(fmt(dmin).length, fmt(dmax).length, fmt((dmin + dmax) / 2).length) * 6.6;
  }

  /** Space to reserve for an axis on a given side (vertical → width, else height). */
  private axisReserve(opts: AxisOptions, side: 'top' | 'bottom' | 'left' | 'right', labelW: number): number {
    if (opts.visible === false) return 6;
    const title = opts.title?.text ? 1 : 0;
    if (side === 'left' || side === 'right') {
      return Math.max(LAYOUT.defaultLeftAxisWidth, LAYOUT.tickLength + 8 + labelW + (title ? 18 : 0));
    }
    // Horizontal axis: rotated labels project downward, so grow the band by the
    // label's vertical extent at that angle.
    const rot = opts.labels?.rotation ?? 0;
    const rotExtra = rot ? Math.abs(Math.sin((rot * Math.PI) / 180)) * labelW : 0;
    return LAYOUT.defaultBottomAxisHeight + (title ? 24 : 0) + rotExtra;
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

    // xAxis is the category axis, yAxis the value axis. When the chart is
    // inverted the category axis becomes vertical (left/right) and the value
    // axis horizontal (bottom/top) — so their options and reserved sides swap.
    const catOpts = this.firstAxis(this.options.xAxis) ?? {};
    const valOpts = this.firstAxis(this.options.yAxis) ?? {};
    const catSide = inverted ? (catOpts.opposite ? 'right' : 'left') : (catOpts.opposite ? 'top' : 'bottom');
    const valSide = inverted ? (valOpts.opposite ? 'top' : 'bottom') : (valOpts.opposite ? 'right' : 'left');

    const catReserve = this.axisReserve(catOpts, catSide, this.catLabelWidth(visible));
    const valReserve = this.axisReserve(valOpts, valSide, this.valueLabelWidth(visible, valOpts));
    const pad = { left: 8, right: 8, top: 6, bottom: 6 };
    pad[catSide] = catReserve;
    pad[valSide] = valReserve;
    const axisPlot: Rect = {
      x: plot.x + pad.left,
      y: plot.y + pad.top,
      width: plot.width - pad.left - pad.right,
      height: plot.height - pad.top - pad.bottom,
    };

    this.computeStacks(visible);
    const { xScale, yScale } = this.buildScales(visible, axisPlot, inverted);
    const group = this.groupInfo(visible);
    // Category scale is vertical (yScale) when inverted, else horizontal (xScale).
    const catScale = inverted ? yScale : xScale;
    const valScale = inverted ? xScale : yScale;

    // Axes.
    const axisLayer = this.renderer.group({ class: 'facet-axes' }, this.renderer.root);
    new Axis({ renderer: this.renderer, scale: catScale, position: catSide, plot: axisPlot, options: catOpts, grid: false }).render(axisLayer);
    new Axis({ renderer: this.renderer, scale: valScale, position: valSide, plot: axisPlot, options: valOpts, grid: true }).render(axisLayer);

    // Remember the plot + scales for drag-zoom and crosshair (single-panel).
    this.plotCtx = { plot: axisPlot, xScale, yScale, inverted };
    this.zoomState = !inverted ? { plot: axisPlot, xScale, yScale } : undefined;

    // Series. High-volume point/line series are drawn to a canvas overlay.
    const boost = !inverted && this.boostEnabled(visible);
    const cctx = boost ? this.createBoostCanvas(axisPlot) : null;
    const hits: BoostHit[] = [];
    const existing = new Set(this.renderer.root.children);
    for (const s of visible) {
      if (cctx && this.isBoostable(s)) {
        this.drawBoostSeries(s, cctx, xScale, yScale, hits);
      } else {
        const ctx = this.seriesContext(s, axisPlot, xScale, yScale, group, inverted, false);
        s.render(ctx);
      }
    }
    // Clip series content to the plot so off-range data (e.g. after zoom) can't
    // spill past the axes.
    this.clipToPlot(axisPlot, existing);
    if (cctx) this.installBoostHover(axisPlot, hits);
  }

  /** Clip the series groups added since `existing` was captured to the plot rect. */
  private clipToPlot(plot: Rect, existing: Set<Element>): void {
    const NS = 'http://www.w3.org/2000/svg';
    const root = this.renderer.root;
    let defs = root.querySelector('defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); root.insertBefore(defs, root.firstChild); }
    const id = `facet-clip-${++this.clipSeq}`;
    const cp = document.createElementNS(NS, 'clipPath');
    cp.setAttribute('id', id);
    const rect = document.createElementNS(NS, 'rect');
    // A couple of px of slack so edge markers aren't harshly cut.
    rect.setAttribute('x', String(plot.x - 2)); rect.setAttribute('y', String(plot.y - 2));
    rect.setAttribute('width', String(plot.width + 4)); rect.setAttribute('height', String(plot.height + 4));
    cp.appendChild(rect); defs.appendChild(cp);

    for (const el of Array.from(root.children)) {
      if (existing.has(el)) continue;
      const cls = el.getAttribute('class') ?? '';
      if (cls.includes('facet-series') || cls.includes('facet-boost')) el.setAttribute('clip-path', `url(#${id})`);
    }
  }

  // -- Boost (high-volume canvas rendering) ------------------------------

  private static readonly BOOSTABLE = new Set(['scatter', 'jitter', 'bubble', 'line', 'spline', 'step', 'area', 'areaspline']);

  private isBoostable(s: BaseSeries): boolean {
    return FacetChart.BOOSTABLE.has(s.type);
  }

  private boostEnabled(visible: BaseSeries[]): boolean {
    const b = this.options.chart?.boost;
    if (b === false) return false;
    const enabled = typeof b === 'object' ? b.enabled : b;
    if (enabled) return true;
    const threshold = (typeof b === 'object' && b.threshold) || 1500;
    return visible.some((s) => this.isBoostable(s) && s.points.length > threshold);
  }

  /** A canvas overlay sized to the plot, drawing in the SVG coordinate system. */
  private createBoostCanvas(plot: Rect): CanvasRenderingContext2D | null {
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(plot.x)); fo.setAttribute('y', String(plot.y));
    fo.setAttribute('width', String(plot.width)); fo.setAttribute('height', String(plot.height));
    fo.setAttribute('class', 'facet-boost');
    const canvas = document.createElement('canvas');
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.max(1, Math.round(plot.width * dpr));
    canvas.height = Math.max(1, Math.round(plot.height * dpr));
    canvas.style.width = `${plot.width}px`; canvas.style.height = `${plot.height}px`;
    fo.appendChild(canvas);
    this.renderer.root.appendChild(fo);
    let c: CanvasRenderingContext2D | null = null;
    try { c = canvas.getContext('2d'); } catch { c = null; }
    if (!c) { fo.remove(); return null; } // no canvas support → fall back to SVG
    c.scale(dpr, dpr);
    c.translate(-plot.x, -plot.y); // draw using SVG coordinates
    return c;
  }

  private drawBoostSeries(s: BaseSeries, c: CanvasRenderingContext2D, xScale: Scale, yScale: Scale, hits: BoostHit[]): void {
    const color = s.color;
    if (['line', 'spline', 'step', 'area', 'areaspline'].includes(s.type)) {
      const raw = s.points.filter((p) => p.y !== undefined).map((p) => ({ x: xScale.scale(p.x), y: yScale.scale(p.y as number), point: p }));
      const pts = decimateLine(raw);
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.strokeStyle = color; c.lineWidth = s.options.lineWidth ?? 2; c.lineJoin = 'round'; c.stroke();
      if (s.type.startsWith('area')) {
        const zeroY = yScale.scale(0);
        c.lineTo(pts[pts.length - 1].x, zeroY); c.lineTo(pts[0].x, zeroY); c.closePath();
        c.fillStyle = alpha(color, 0.25); c.fill();
      }
      for (const p of raw) hits.push({ x: p.x, y: p.y, point: p.point, series: s });
    } else {
      // scatter / jitter / bubble
      const zs = s.type === 'bubble' ? s.points.map((p) => (p.options.z as number) ?? 1) : [];
      const zMin = zs.length ? Math.min(...zs) : 0, zMax = zs.length ? Math.max(...zs) : 1;
      const [rMin, rMax] = s.options.sizeRange ?? [3, 22];
      c.fillStyle = alpha(color, 0.6);
      for (const p of s.points) {
        if (p.y === undefined) continue;
        const px = xScale.scale(p.x), py = yScale.scale(p.y);
        let r = s.options.marker?.radius ?? 3;
        if (s.type === 'bubble') { const t = zMax === zMin ? 1 : (((p.options.z as number) ?? 1) - zMin) / (zMax - zMin); r = Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin)); }
        c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
        hits.push({ x: px, y: py, point: p, series: s });
      }
    }
  }

  /** Nearest-point hover for boosted series (no per-point DOM nodes). */
  private installBoostHover(plot: Rect, hits: BoostHit[]): void {
    if (!this.tooltip || !hits.length) return;
    let marker: SVGElement | undefined;
    const root = this.renderer.root;
    const onMove = (e: MouseEvent) => {
      const mx = this.localX(e.clientX), my = this.localY(e.clientY);
      if (mx < plot.x || mx > plot.x + plot.width || my < plot.y || my > plot.y + plot.height) return;
      let best: BoostHit | null = null, bd = 400; // 20px radius²
      for (const h of hits) { const dx = h.x - mx, dy = h.y - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = h; } }
      marker?.remove(); marker = undefined;
      if (!best) { this.tooltip!.hide(); return; }
      marker = this.renderer.create('circle', { cx: best.x, cy: best.y, r: 5, fill: 'none', stroke: best.series.color, 'stroke-width': 2, 'pointer-events': 'none' }, root);
      const p = best.point, s = best.series;
      this.tooltip!.show({ series: s.name, x: p.name ?? p.x, y: p.y, name: p.name ?? p.x, point: p.options, color: p.color ?? s.color }, s.options.tooltip);
      this.tooltip!.move(e.clientX, e.clientY);
    };
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', () => { marker?.remove(); marker = undefined; this.tooltip!.hide(); });
  }

  /**
   * Cross-tab trellis table. All cells share one y-scale and one x-scale;
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

    // Gutters: header labels + shared axis space, laid out like a pivot
    // table — column field + values as a header row on top, row field +
    // values as a header column on the left (both horizontal, like normal
    // table headers), the row field name once in the top-left corner cell.
    // Divider lines carry the nested-axis convention used elsewhere in the
    // library (plain bold labels, thin full-span separators, no boxed/shaded
    // chrome) so a trellis chart still reads consistently with the rest of
    // the library. No axis titles (e.g. "Sales"/"Month") — the row/column
    // headers already say what's split, and repeating the measure name on
    // every row is redundant once it's in the chart title.
    const dimNameRowH = 16;
    const rowValueColW = rowDim
      ? Math.max(
          32,
          Math.max(rowDim.length, ...rowVals.filter((v) => v !== undefined).map((v) => String(v).length), 0) * 6.6 + 4,
        )
      : 0;
    // Tight tick-label width for these actual values, rather than the fixed
    // generic axis width — keeps the left gutter close to the numbers.
    const tickLabelW = LAYOUT.tickLength + 8 + this.valueLabelWidth(allVisible, yOpts);
    const colHeaderH = colDim ? dimNameRowH + 20 : rowDim ? dimNameRowH : 0;
    const rowHeaderW = rowDim ? rowValueColW : 0;
    const leftReserve = rowHeaderW + tickLabelW;
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;

    const gridX = outer.x + leftReserve;
    const gridY = outer.y + colHeaderH;
    const gridW = outer.width - leftReserve;
    const gridH = outer.height - colHeaderH - bottomReserve;
    const cellW = (gridW - gap * (colVals.length - 1)) / colVals.length;
    const cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length;
    const lineColor = THEME.axis.lineColor;

    const headerLayer = this.renderer.group({ class: 'facet-trellis-headers' }, this.renderer.root);
    // Shared bottom extent for every full-height vertical divider, so they
    // all end at the same point, just past the shared bottom axis.
    const dividerBottom = gridY + gridH + LAYOUT.tickLength + 12;

    // Column headers across the top, with full-height divider lines carrying
    // down through the shared bottom axis — the same visual language as the
    // nested x-axis's group separators.
    if (colDim) {
      this.renderer.text(colDim, gridX + gridW / 2, outer.y + dimNameRowH / 2 + 4, {
        'text-anchor': 'middle', ...FONTS.axisTitle,
      }, headerLayer);
      colVals.forEach((cv, ci) => {
        if (cv === undefined) return;
        const cx = gridX + ci * (cellW + gap) + cellW / 2;
        this.renderer.text(String(cv), cx, outer.y + dimNameRowH + 17, {
          'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': '600', fill: THEME.axis.titleColor,
        }, headerLayer);
        if (ci > 0) {
          const dx = gridX + ci * (cellW + gap) - gap / 2;
          // Starts below the (single, shared) dimension-name label so it
          // never cuts through it — the label isn't repeated per column.
          this.renderer.create('line', {
            x1: dx, y1: outer.y + dimNameRowH, x2: dx, y2: dividerBottom, stroke: lineColor, 'stroke-width': 1,
          }, headerLayer);
        }
      });
    }

    // Row header down the left side — a pivot-table row-header column: the
    // dimension name once in the top-left corner cell, then each row's value
    // as normal (unrotated) text next to its cell, with full-width dividers.
    if (rowDim) {
      this.renderer.text(rowDim, outer.x + rowHeaderW / 2, outer.y + colHeaderH / 2 + 4, {
        'text-anchor': 'middle', ...FONTS.axisTitle,
      }, headerLayer);
      rowVals.forEach((rv, ri) => {
        if (rv === undefined) return;
        const cy = gridY + ri * (cellH + gap) + cellH / 2 + 4;
        this.renderer.text(String(rv), outer.x + rowHeaderW / 2, cy, {
          'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': '600', fill: THEME.axis.titleColor,
        }, headerLayer);
        if (ri > 0) {
          const dy = gridY + ri * (cellH + gap) - gap / 2;
          this.renderer.create('line', {
            x1: outer.x, y1: dy, x2: outer.x + outer.width, y2: dy, stroke: lineColor, 'stroke-width': 1,
          }, headerLayer);
        }
      });
      // Separates the row-header column (region / East / West) from the axis
      // and plot area.
      this.renderer.create('line', {
        x1: outer.x + rowHeaderW, y1: outer.y, x2: outer.x + rowHeaderW, y2: dividerBottom,
        stroke: lineColor, 'stroke-width': 1,
      }, headerLayer);
    }

    // Separates the top header band (region corner / cat + values) from the
    // grid below.
    if (colHeaderH) {
      this.renderer.create('line', {
        x1: outer.x, y1: gridY, x2: outer.x + outer.width, y2: gridY, stroke: lineColor, 'stroke-width': 1,
      }, headerLayer);
    }

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

        const xScale = categories
          ? new CategoryScale({ categories, range: [cell.x, cell.x + cell.width] })
          : new LinearScale({ domain: this.xNumericDomain(cellSeries.length ? cellSeries : allVisible), range: [cell.x, cell.x + cell.width] });
        let yScale = this.valueScale(yOpts, [vMin, vMax], [cell.y + cell.height, cell.y]);
        // Drop the topmost tick (e.g. "10") — it sits right against the
        // header divider and reads as clutter there. Same domain/range, so
        // bars plot identically; only the tick/gridline/label list shrinks.
        if (yScale instanceof LinearScale) {
          const allTicks = yScale.ticks();
          if (allTicks.length > 1) {
            yScale = new LinearScale({
              domain: yScale.domain, range: [cell.y + cell.height, cell.y], ticks: allTicks.slice(0, -1),
            });
          }
        }

        const axisLayer = this.renderer.group({ class: 'facet-axes' }, this.renderer.root);
        const isLeft = ci === 0;
        const isBottom = ri === rowVals.length - 1;

        // Y axis: labelled on the left column, gridlines only elsewhere.
        new Axis({
          renderer: this.renderer, scale: yScale, position: 'left', plot: cell, grid: true,
          options: isLeft
            ? { ...yOpts, title: undefined }
            : { labels: { enabled: false }, lineWidth: 0 },
        }).render(axisLayer);

        // X axis: labelled on the bottom row only, no tick marks — just the
        // line and labels.
        new Axis({
          renderer: this.renderer, scale: xScale, position: 'bottom', plot: cell, grid: false,
          options: isBottom
            ? { ...xOpts, title: undefined, ticks: false }
            : { labels: { enabled: false }, lineWidth: 0, ticks: false },
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
  }

  private renderPolarPanel(plot: Rect, visible: BaseSeries[]): void {
    // Pie/radial: no shared scales; dummy scales satisfy the interface.
    const dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    for (const s of visible) {
      const ctx = this.seriesContext(s, plot, dummy, dummy, { count: 1, index: new Map() }, false, true);
      s.render(ctx);
    }
  }

  // -- Nested (hierarchical x-axis) ------------------------------

  private renderNestedPanel(outer: Rect, visible: BaseSeries[], dims: string[]): void {
    if (!visible.length) return;
    const agg = this.firstAxis(this.options.xAxis)?.aggregate ?? 'sum';
    const { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;

    // Series carrying only their aggregated leaf points.
    const aggSeries = visible.map((s) => s.withPoints(seriesPoints.get(s.index) ?? []));

    // Dual axis: series binding to yAxis index 1 use a secondary (right) scale.
    const yOpts0 = this.axisAt(this.options.yAxis, 0);
    const yOpts1 = this.axisAt(this.options.yAxis, 1);
    const onAxis = (s: BaseSeries, i: number) => (s.options.yAxis ?? 0) === i;
    const secondary = aggSeries.filter((s) => onAxis(s, 1));
    const hasSecondary = secondary.length > 0;

    // Reserve axis space. In split mode (opposite) the innermost dimension is
    // labelled at the bottom while the outer grouping dimensions sit on top.
    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const split = !!xOpts.opposite;
    const rowH = 18;
    const leftReserve = LAYOUT.tickLength + 8 + this.valueLabelWidth(aggSeries.filter((s) => onAxis(s, 0)), yOpts0) + (yOpts0.title?.text ? 18 : 0);
    const rightReserve = hasSecondary ? LAYOUT.tickLength + 8 + this.valueLabelWidth(secondary, yOpts1) + (yOpts1.title?.text ? 18 : 0) : 8;
    const bottomReserve = LAYOUT.tickLength + (split ? 1 : dims.length) * rowH + 12;
    const topReserve = split ? LAYOUT.tickLength + (dims.length - 1) * rowH + 8 : 6;
    const plot: Rect = {
      x: outer.x + leftReserve,
      y: outer.y + topReserve,
      width: outer.width - leftReserve - rightReserve,
      height: outer.height - topReserve - bottomReserve,
    };

    const xScale = new CategoryScale({ categories: keys, range: [plot.x, plot.x + plot.width] });
    const range: [number, number] = [plot.y + plot.height, plot.y];
    const scaleFor = (list: BaseSeries[], opts: AxisOptions) => {
      let [lo, hi] = this.valueDomain(list.length ? list : aggSeries);
      lo = Math.min(lo, 0); hi = Math.max(hi, 0);
      return this.valueScale(opts, [lo, hi], range);
    };
    const yScale0 = scaleFor(aggSeries.filter((s) => onAxis(s, 0)), yOpts0);
    const yScale1 = hasSecondary ? scaleFor(secondary, yOpts1) : yScale0;

    const axisLayer = this.renderer.group({ class: 'facet-axes' }, this.renderer.root);
    new Axis({ renderer: this.renderer, scale: yScale0, position: 'left', plot, options: yOpts0, grid: true }).render(axisLayer);
    if (hasSecondary) {
      new Axis({ renderer: this.renderer, scale: yScale1, position: 'right', plot, options: yOpts1, grid: false }).render(axisLayer);
    }
    new NestedAxis({ renderer: this.renderer, scale: xScale, plot, leaves, keys, position: split ? 'split' : 'bottom' }).render(axisLayer);

    const group = this.groupInfo(aggSeries);
    const lineFamily = new Set(['line', 'spline', 'step', 'area', 'areaspline']);
    for (const s of aggSeries) {
      const yScale = onAxis(s, 1) ? yScale1 : yScale0;
      const ctx = this.seriesContext(s, plot, xScale, yScale, group, false, false);
      if (lineFamily.has(s.type)) {
        // Draw a separate line per first-dimension group so the line does not
        // run continuously across group boundaries.
        let segStart = 0;
        for (let i = 1; i <= s.points.length; i++) {
          const boundary = i === s.points.length || leaves[s.points[i].index][0] !== leaves[s.points[segStart].index][0];
          if (boundary) {
            s.withPoints(s.points.slice(segStart, i)).render(ctx);
            segStart = i;
          }
        }
      } else {
        s.render(ctx);
      }
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

    const axisLayer = this.renderer.group({ class: 'facet-axes' }, this.renderer.root);
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
    const g = this.renderer.group({ class: `facet-series facet-butterfly ${s.name}` }, this.renderer.root);
    const barH = band * 0.8;
    for (const p of s.points) {
      if (p.y === undefined) continue;
      const vx = valScale.scale(p.y);
      const rect = {
        x: Math.min(zeroX, vx), y: catScale.scale(p.x) - barH / 2,
        width: Math.max(1, Math.abs(vx - zeroX)), height: barH,
      };
      const el = this.renderer.create('rect', { ...rect, fill: p.color ?? s.color, class: 'facet-point' }, g);
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

  // -- Radar (spider) ----------------------------------------------------

  private renderRadarPanel(outer: Rect, visible: BaseSeries[]): void {
    if (!visible.length) return;
    const cats = this.currentCategories(visible) ?? [];
    const n = cats.length;
    if (n < 3) return;
    const cx = outer.x + outer.width / 2;
    const cy = outer.y + outer.height / 2 + 4;
    const R = Math.min(outer.width, outer.height) / 2 - 34;
    const [, vMaxRaw] = this.valueDomain(visible);
    const vMax = Math.max(vMaxRaw, 0) || 1;
    const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const pt = (i: number, v: number) => ({ x: cx + (v / vMax) * R * Math.cos(angle(i)), y: cy + (v / vMax) * R * Math.sin(angle(i)) });
    const grid = this.renderer.group({ class: 'facet-axes' }, this.renderer.root);

    // Concentric grid rings + spokes.
    for (let r = 1; r <= 4; r++) {
      const ring = cats.map((_, i) => { const p = pt(i, (vMax * r) / 4); return `${p.x},${p.y}`; }).join(' ');
      this.renderer.create('polygon', { points: ring, fill: 'none', stroke: THEME.axis.gridLineColor, 'stroke-width': 1 }, grid);
    }
    cats.forEach((cat, i) => {
      const edge = pt(i, vMax);
      this.renderer.create('line', { x1: cx, y1: cy, x2: edge.x, y2: edge.y, stroke: THEME.axis.gridLineColor }, grid);
      const lp = pt(i, vMax * 1.12);
      this.renderer.text(String(cat), lp.x, lp.y, {
        'text-anchor': Math.abs(lp.x - cx) < 4 ? 'middle' : lp.x > cx ? 'start' : 'end',
        'dominant-baseline': 'middle', ...FONTS.axisLabel,
      }, grid);
    });

    // One polygon per series.
    for (const s of visible) {
      const g = this.renderer.group({ class: `facet-series facet-radar ${s.name}` }, this.renderer.root);
      const pts = cats.map((cat, i) => {
        const p = s.points.find((pp) => String(pp.x) === String(cat)) ?? s.points[i];
        return pt(i, p?.y ?? 0);
      });
      const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
      const fillOp = s.options.fillOpacity ?? (s.type === 'area' ? 0.3 : 0.12);
      this.renderer.create('polygon', { points: poly, fill: alpha(s.color, fillOp), stroke: s.color, 'stroke-width': 2 }, g);
      pts.forEach((p, i) => {
        const point = s.points.find((pp) => String(pp.x) === String(cats[i])) ?? s.points[i];
        if (!point) return;
        const el = this.renderer.create('circle', { cx: p.x, cy: p.y, r: 3.5, fill: s.color, stroke: '#fff', 'stroke-width': 1, class: 'facet-point' }, g);
        this.bindTooltip(el, s, point);
        el.addEventListener('click', (e) => this.handlePointEvent('click', s, point, e));
      });
    }
  }

  // -- Marimekko (mosaic) ------------------------------------------------

  private renderMarimekkoPanel(outer: Rect, visible: BaseSeries[]): void {
    if (!visible.length) return;
    const cats = this.currentCategories(visible) ?? [];
    if (!cats.length) return;
    const bottomReserve = 22, plot: Rect = { x: outer.x + 8, y: outer.y + 6, width: outer.width - 16, height: outer.height - bottomReserve - 6 };

    // Column total across series drives column width; grand total normalises x.
    const colTotal = cats.map((c) => visible.reduce((s, ser) => s + (ser.points.find((p) => String(p.x) === String(c))?.y ?? 0), 0));
    const grand = colTotal.reduce((a, b) => a + b, 0) || 1;
    const gap = 2;
    let x = plot.x;
    cats.forEach((cat, ci) => {
      const w = (colTotal[ci] / grand) * (plot.width - gap * (cats.length - 1));
      let y = plot.y;
      visible.forEach((s, si) => {
        const p = s.points.find((pp) => String(pp.x) === String(cat));
        const val = p?.y ?? 0;
        const h = colTotal[ci] > 0 ? (val / colTotal[ci]) * plot.height : 0;
        const el = this.renderer.create('rect', {
          x, y, width: Math.max(1, w), height: Math.max(0, h),
          fill: p?.color ?? s.color ?? paletteColor(this.colors, si), stroke: '#fff', 'stroke-width': 1, class: 'facet-point',
        }, this.renderer.group({ class: `facet-series facet-marimekko ${s.name}` }, this.renderer.root));
        if (p) { this.bindTooltip(el, s, p); el.addEventListener('click', (e) => this.handlePointEvent('click', s, p, e)); }
        // Percentage label in roomy segments.
        if (h > 16 && w > 26 && val > 0) {
          this.renderer.text(`${Math.round((val / colTotal[ci]) * 100)}%`, x + w / 2, y + h / 2, {
            'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: '#fff', 'font-weight': '600',
          }, this.renderer.root);
        }
        y += h;
      });
      // Category label + width readout.
      this.renderer.text(String(cat), x + w / 2, plot.y + plot.height + 14, { 'text-anchor': 'middle', ...FONTS.axisLabel }, this.renderer.root);
      x += w + gap;
    });
  }

  /**
   * Collapse each series' points into one aggregated value per unique
   * combination of `dims`. Leaves are ordered so that outer dimensions form
   * contiguous groups (first-seen order per level) so each group stays together.
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

    // Value domain across visible series. Error bars are typically overlaid on
    // (and read like) a column series, so they share its zero baseline.
    let [vMin, vMax] = this.valueDomain(visible);
    const includeZero = visible.some((s) => ['column', 'bar', 'area', 'areaspline', 'errorbar'].includes(s.type));
    if (includeZero) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }

    // Marker/whisker-based series (bubble, scatter, jitter, dumbbell, boxplot,
    // candlestick, columnrange): pad the value domain so an extreme point/whisker
    // doesn't land exactly on a "nice" tick and end up sitting astride (or
    // clipped by) the axis line. Uses a flat pixel amount per type since these
    // shapes have a roughly constant on-screen size regardless of the data
    // range. Applies to whichever axis carries values — y normally, x when the
    // chart is inverted (horizontal) — so it's measured against the matching
    // plot dimension.
    const GEOM_PAD: Partial<Record<ChartType, number>> = {
      boxplot: 8, candlestick: 8, columnrange: 10,
    };
    const bubble = visible.find((s) => s.type === 'bubble');
    const bubbleR = bubble ? (bubble.options.sizeRange?.[1] ?? 34) + 2 : 0;
    const markerR = Math.max(
      bubbleR,
      ...visible
        .filter((s) => s.type === 'scatter' || s.type === 'jitter' || s.type === 'dumbbell')
        .map((s) => (s.options.marker?.radius ?? 5) + 2),
      ...visible.map((s) => GEOM_PAD[s.type] ?? 0),
      0,
    );
    if (markerR) {
      const valueAxisOpts = inverted ? xAxisOpts : yAxisOpts;
      const valuePx = inverted ? plot.width : plot.height;
      const padY = (markerR / Math.max(1, valuePx)) * (vMax - vMin || 1);
      if (valueAxisOpts.min === undefined) vMin -= padY;
      if (valueAxisOpts.max === undefined) vMax += padY;
    }

    // Datetime x: nice date ticks + auto date label format.
    const datetime = xAxisOpts.type === 'datetime' && !categories;
    const xNumeric = (range: [number, number], reversed?: boolean): Scale => {
      const [dmin, dmax] = this.xNumericDomain(visible);
      let min = xAxisOpts.min ?? dmin, max = xAxisOpts.max ?? dmax;
      if (markerR) {
        const padX = (markerR / Math.max(1, plot.width)) * (max - min || 1);
        if (xAxisOpts.min === undefined) min -= padX;
        if (xAxisOpts.max === undefined) max += padX;
      }
      if (datetime) {
        const { ticks, format } = niceDateTicks(min, max);
        return new LinearScale({ domain: [min, max], range, reversed, ticks, format: (v) => formatDate(v, format) });
      }
      return new LinearScale({ domain: [min, max], range, ...(reversed ? { reversed } : {}) });
    };

    const catScale = (range: [number, number], reversed?: boolean) =>
      categories ? new CategoryScale({ categories, range, reversed }) : xNumeric(range, reversed);

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

  /**
   * Series types that need a banded (categorical) x-axis so bars get a real
   * width. Continuous types (line/area/scatter/bubble/histogram) stay numeric.
   */
  private static readonly BANDED = new Set<ChartType>([
    'column', 'bar', 'boxplot', 'candlestick', 'waterfall', 'columnrange',
    'errorbar', 'bullet', 'dumbbell', 'butterfly',
  ]);

  private currentCategories(visible: BaseSeries[]): string[] | undefined {
    const xAxis = this.firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    // A datetime/continuous x-axis stays numeric even for bar-family series.
    const banded = xAxis?.type !== 'datetime' && visible.some((s) => FacetChart.BANDED.has(s.type));
    const allNumeric = visible.every((s) => s.points.every((p) => typeof p.x === 'number'));
    // Continuous axis only when nothing needs a band; otherwise fall through and
    // build categories from the (possibly index-based) x values so bars get width.
    if (allNumeric && !banded) return undefined;
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
    const total = s.points.reduce((sum, pt) => sum + (pt.y ?? 0), 0);
    const build = (): TooltipContext => {
      const ctx: TooltipContext = {
        series: s.name,
        x: p.name ?? p.x,
        y: p.y ?? p.high,
        name: p.name ?? p.x,
        index: p.index,
        total,
        percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
        low: p.low,
        high: p.high,
        box: p.box,
        point: p.options,
        color: p.color ?? s.color,
      };
      // Shared tooltip: gather every visible series' value at this x into one box.
      if (this.options.tooltip?.shared) ctx.points = this.pointsAtX(p.x);
      return ctx;
    };
    el.addEventListener('mouseenter', () => { this.tooltip!.show(build(), s.options.tooltip); this.showCrosshair(p); });
    el.addEventListener('mousemove', (e) => this.tooltip!.move(e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => { this.tooltip!.hide(); this.hideCrosshair(); });
  }

  /** Draw a guide line at the hovered point when `xAxis.crosshair` is on. */
  private showCrosshair(p: Point): void {
    const ctx = this.plotCtx;
    if (!this.firstAxis(this.options.xAxis)?.crosshair || !ctx || ctx.inverted) return;
    this.hideCrosshair();
    const x = ctx.xScale.scale(p.x);
    this.crosshairEl = this.renderer.create('line', {
      x1: x, y1: ctx.plot.y, x2: x, y2: ctx.plot.y + ctx.plot.height,
      stroke: THEME.axis.labelColor, 'stroke-width': 1, 'stroke-dasharray': '3 3',
      'pointer-events': 'none', class: 'facet-crosshair',
    }, this.renderer.root);
  }

  private hideCrosshair(): void {
    this.crosshairEl?.remove();
    this.crosshairEl = undefined;
  }

  /** All visible series' points sharing an x value (for the shared tooltip). */
  private pointsAtX(x: number | string): TooltipContext[] {
    const rows: TooltipContext[] = [];
    for (const s of this.series) {
      if (!s.visible || !s.capabilities().cartesian) continue;
      const match = s.points.find((pp) => String(pp.x) === String(x));
      if (!match) continue;
      rows.push({
        series: s.name, x: match.name ?? match.x, y: match.y ?? match.high,
        low: match.low, high: match.high, point: match.options, color: match.color ?? s.color,
      });
    }
    return rows;
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
    if (kind === 'click') {
      se?.click?.(payload); this.options.chart?.events?.click?.(payload);
      const ddId = p.options.drilldown;
      if (typeof ddId === 'string') this.drillTo(ddId);
    }
    if (kind === 'mouseOver') se?.mouseOver?.(payload);
    if (kind === 'mouseOut') se?.mouseOut?.(payload);
  }

  /** Replace the series with the matching drilldown series (click-to-expand). */
  private drillTo(id: string): void {
    const dd = this.options.drilldown?.series.find((s) => s.id === id);
    if (!dd) return;
    this.drillStack.push({ series: this.options.series, title: this.options.title, xAxis: this.options.xAxis });
    this.options.series = [dd];
    if (dd.name) this.options.title = { text: dd.name };
    // Derive fresh categories from the drilldown data (drop the parent's).
    const xa = this.axisAt(this.options.xAxis, 0);
    const { categories, ...rest } = xa;
    this.options.xAxis = rest;
    this.build(); this.animateNext = true; this.render();
    this.events.emit('drilldown', { id, series: dd });
  }

  /** Return to the previous level after a drill-down. */
  drillUp(): void {
    const prev = this.drillStack.pop();
    if (!prev) return;
    this.options.series = prev.series;
    this.options.title = prev.title;
    this.options.xAxis = prev.xAxis;
    this.build(); this.animateNext = true; this.render();
    this.events.emit('drillup', {});
  }

  /** Breadcrumb "← Back" control shown while drilled in. */
  private drawDrillUp(outer: Rect): void {
    if (!this.drillStack.length) return;
    const g = this.renderer.group({ class: 'facet-drillup', style: 'cursor:pointer' }, this.renderer.root);
    const bx = outer.x, by = outer.y + 2;
    this.renderer.create('rect', { x: bx, y: by, width: 62, height: 22, rx: 5, fill: this.theme.tooltip.backgroundColor, stroke: THEME.axis.lineColor }, g);
    this.renderer.text('← Back', bx + 31, by + 15, { 'text-anchor': 'middle', ...FONTS.axisLabel, fill: this.theme.axis.labelColor }, g);
    g.addEventListener('click', () => this.drillUp());
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
    return this.series.length === 1 && !!first && first.capabilities().pointLegend === true;
  }

  private buildLegendItems(): LegendItem[] {
    const first = this.series[0];
    // A series may supply its own legend (e.g. multi-level pie → inner groups).
    if (this.series.length === 1 && first?.legendItems) {
      const custom = first.legendItems(this.colors);
      if (custom) return custom;
    }
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
    const first = this.series[0];
    // Custom legend provider (e.g. multi-level pie groups).
    if (this.series.length === 1 && first?.legendItems && first.onLegendToggle && first.legendItems(this.colors)) {
      first.onLegendToggle(index);
      this.render();
      return;
    }
    // Point-legend charts toggle an individual slice/ring; others toggle a series.
    if (this.isPointLegend()) {
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

  /** Merge new options and re-render (rebuilds series when `series` is given). */
  update(options: Partial<ChartOptions>): void {
    Object.assign(this.options, merge(this.options, options as ChartOptions));
    if (options.series) this.build();
    this.animateNext = true;
    this.render();
  }

  /** Replace one series' data in place and re-render (incremental update). */
  setData(seriesIndex: number, data: SeriesOptions['data']): void {
    const opts = this.options.series[seriesIndex];
    if (!opts) return;
    opts.data = data;
    this.build();
    this.animateNext = true;
    this.render();
  }

  /** Append a point to a series and re-render. */
  addPoint(seriesIndex: number, point: SeriesOptions['data'][number]): void {
    const opts = this.options.series[seriesIndex];
    if (!opts) return;
    opts.data = [...opts.data, point];
    this.build();
    this.render();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.render();
  }

  /** Serialise the chart to a standalone SVG string. */
  getSVG(): string {
    const clone = this.renderer.root.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(this.width));
    clone.setAttribute('height', String(this.height));
    return new XMLSerializer().serializeToString(clone);
  }

  /** Trigger a download of the chart as an SVG file. */
  downloadSVG(filename = 'chart.svg'): void {
    this.triggerDownload(new Blob([this.getSVG()], { type: 'image/svg+xml' }), filename);
  }

  /** Rasterise to PNG (`scale`× resolution) and download. */
  async downloadPNG(filename = 'chart.png', scale = 2): Promise<void> {
    const blob = await this.toPNGBlob(scale);
    if (blob) this.triggerDownload(blob, filename);
  }

  /** Rasterise the chart to a PNG Blob. */
  toPNGBlob(scale = 2): Promise<Blob | null> {
    return new Promise((resolve) => {
      const svg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.getSVG());
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = this.width * scale;
        canvas.height = this.height * scale;
        const c = canvas.getContext('2d');
        if (!c) return resolve(null);
        c.fillStyle = this.options.chart?.backgroundColor ?? this.theme.backgroundColor;
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = svg;
    });
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  destroy(): void {
    this.tooltip?.destroy();
    this.resizeObserver?.disconnect();
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

/** A boosted point's pixel position, for nearest-point hover lookup. */
interface BoostHit {
  x: number;
  y: number;
  point: Point;
  series: BaseSeries;
}
