/**
 * FacetViz — the top-level chart controller.
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
  AppendDataOptions,
  MarkerOptions,
} from "./options.js";
import { Renderer } from "./renderer.js";
import { Axis, Rect } from "./axis.js";
import {
  NestedAxis,
  nestedLevelWidths,
  nestedInnerRotationExtent,
} from "./nested-axis.js";
import { Tooltip } from "./tooltip.js";
import { Legend, LegendItem } from "./legend.js";
import { EventEmitter } from "./events.js";
import { LinearScale, LogScale, CategoryScale, Scale } from "./scale.js";
import { LAYOUT, FONTS } from "./defaults.js";
import {
  merge,
  extent,
  niceDateTicks,
  formatDate,
  formatString,
  decimateLine,
  sanitizeStyle,
  seededRandom,
} from "./utils.js";
import {
  axisAt,
  firstAxis,
  resolveCategories,
  resolveChartOptions,
} from "./chart-options.js";
import { downloadBlob, rasterizePNG, serializeSVG } from "./chart-export.js";
import { computeStacks } from "./stacking.js";
import { captureSeriesState, restoreSeriesState } from "./series-state.js";
import { enforceConfiguredValidation } from "./validation.js";
import { paletteColor, alpha, shade } from "./colors.js";
import { Theme, resolveTheme, applyTheme, THEME } from "./theme.js";
import { BaseSeries, SeriesRenderContext } from "../series/base.js";
import { createSeries } from "../series/registry.js";
import { drawDataLabel, labelString } from "../series/data-label.js";
import { drawMarker } from "../series/marker.js";
import { renderAnnotations } from "./annotations.js";
import type { Point } from "./point.js";

export class FacetViz {
  readonly container: HTMLElement;
  readonly options: ChartOptions;
  /** Caller-owned configuration, kept separate from resolved series defaults. */
  private userOptions: ChartOptions;
  private renderer!: Renderer;
  private tooltip?: Tooltip;
  readonly events = new EventEmitter();
  series: BaseSeries[] = [];
  private colors: string[];
  private theme: Theme;
  private width: number;
  private height: number;
  private resizeObserver?: ResizeObserver;
  private initialReflowFrame?: number;
  private resizeFrame?: number;
  private destroyed = false;
  private boostHoverCleanups: Array<() => void> = [];
  /** Play the enter animation on the next render (first render + data updates). */
  private animateNext = true;
  /** Scales + plot captured for drag-zoom. */
  private zoomState?: { plot: Rect; xScale: Scale; yScale: Scale };
  /** Plot + scales of the last cartesian panel (for crosshair). */
  private plotCtx?: {
    plot: Rect;
    xScale: Scale;
    xScale2?: Scale;
    yScale: Scale;
    inverted: boolean;
  };
  private crosshairEl?: SVGElement;
  /** Rendered SVG data marks in keyboard-navigation order. */
  private accessiblePoints: Array<{
    el: SVGElement;
    series: BaseSeries;
    point: Point;
  }> = [];
  private clipSeq = 0;
  /** Saved series/title/xAxis levels for drill-down navigation. */
  private drillStack: Array<{
    series: SeriesOptions[];
    title?: TitleOptions;
    xAxis?: AxisOptions | AxisOptions[];
  }> = [];
  /** Nested transaction state used to coalesce public API mutations. */
  private batchDepth = 0;
  private batchDirty = false;
  private batchPreserveSeriesState = true;
  private batchPreserveAxisRange = true;
  private batchNeedsReflow = false;
  private batchAnimate = false;
  private batchCheckpoints: BatchCheckpoint[] = [];

  constructor(container: HTMLElement | string, options: ChartOptions) {
    const el =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
    if (!el) throw new Error("FacetViz: container element not found");
    this.container = el as HTMLElement;
    enforceConfiguredValidation(options);
    this.userOptions = merge({} as ChartOptions, options);
    this.options = resolveChartOptions(this.userOptions);
    this.theme = resolveTheme(this.options.theme);
    // Explicit colours win; otherwise fall back to the theme palette.
    this.colors =
      this.options.chart?.colors ?? this.options.colors ?? this.theme.colors;
    // Default to the container's size so the chart never overflows its
    // parent in either dimension — falls back to a hardcoded size only when
    // the container itself can't report one (e.g. detached from the DOM).
    this.width =
      this.options.chart?.width ?? (this.container.clientWidth || 640);
    this.height =
      this.options.chart?.height ?? (this.container.clientHeight || 400);
    this.build();
    this.render();
    this.options.chart?.events?.load?.(this);
    this.setupReflow();
    // The container may not have finished layout yet when this constructor
    // runs (flex/grid mounting order, layout libraries — e.g. GridStack —
    // that size elements after mount), so clientWidth/clientHeight can read
    // 0 (or a transient wrong value) above and get stuck there. Re-measure
    // once on the next frame and correct the render if the real size
    // differs; this also covers containers whose height only becomes known
    // after this first frame.
    if (typeof requestAnimationFrame !== "undefined") {
      this.initialReflowFrame = requestAnimationFrame(() => {
        this.initialReflowFrame = undefined;
        this.reflow();
      });
    }
  }

  /**
   * Re-read the container's current width/height and re-render if either
   * changed. Safe to call any time — e.g. after your own layout (a resizable
   * panel, a grid library, a tab becoming visible) settles into its final
   * size, so the chart doesn't need to wait for a resize event to catch up.
   * A dimension pinned via `chart.width`/`chart.height` is left untouched.
   */
  reflow(): void {
    if (this.destroyed) return;
    const w = this.options.chart?.width ?? this.container.clientWidth;
    const h = this.options.chart?.height ?? this.container.clientHeight;
    const changed =
      (w && Math.abs(w - this.width) > 1) ||
      (h && Math.abs(h - this.height) > 1);
    if (!changed) return;
    if (w) this.width = w;
    if (h) this.height = h;
    this.animateNext = false;
    this.render();
  }

  /** Re-render when the container resizes (unless reflow/that dimension is disabled). */
  private setupReflow(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.resizeFrame !== undefined) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = undefined;
    }
    if (
      this.options.chart?.reflow === false ||
      typeof ResizeObserver === "undefined" ||
      (this.options.chart?.width && this.options.chart?.height)
    )
      return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = undefined;
        this.reflow();
      });
    });
    this.resizeObserver.observe(this.container);
  }

  // -- Build model -------------------------------------------------------

  private build(): void {
    this.series = this.options.series.map((opts, i) => {
      const categories = resolveCategories(
        [opts],
        axisAt(this.options.xAxis, opts.xAxis ?? 0),
      );
      const s = createSeries(opts.type ?? "line", opts, categories);
      s.index = i;
      // Dumbbells legend/identity read best as their high-end colour.
      s.color = opts.color ?? opts.highColor ?? paletteColor(this.colors, i);
      return s;
    });
  }

  /** Re-resolve all defaults and rebuild the model after an API update. */
  private resolveUpdatedOptions(
    preserveSeriesState: boolean,
    preserveAxisRange = false,
  ): void {
    const state = preserveSeriesState ? captureSeriesState(this.series) : [];
    const xRange = preserveAxisRange ? this.axisRange(this.options.xAxis) : undefined;
    const yRange = preserveAxisRange ? this.axisRange(this.options.yAxis) : undefined;
    const resolved = resolveChartOptions(this.userOptions);
    const target = this.options as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(this.options, resolved);
    if (xRange) this.restoreAxisRange("xAxis", xRange);
    if (yRange) this.restoreAxisRange("yAxis", yRange);

    this.theme = resolveTheme(this.options.theme);
    this.colors =
      this.options.chart?.colors ?? this.options.colors ?? this.theme.colors;
    if (this.options.chart?.width !== undefined)
      this.width = this.options.chart.width;
    if (this.options.chart?.height !== undefined)
      this.height = this.options.chart.height;

    this.build();
    if (preserveSeriesState) restoreSeriesState(this.series, state);
  }

  private axisRange(axis: AxisOptions | AxisOptions[] | undefined): AxisRange | undefined {
    if (!axis || Array.isArray(axis)) return undefined;
    if (axis.min === undefined && axis.max === undefined) return undefined;
    return { min: axis.min, max: axis.max };
  }

  private restoreAxisRange(axis: "xAxis" | "yAxis", range: AxisRange): void {
    const current = this.options[axis];
    if (Array.isArray(current)) return;
    this.options[axis] = { ...(current ?? {}), ...range };
  }

  /** Validate and apply immediately, or queue a single rebuild/render in a batch. */
  private commitOptions(
    nextOptions: ChartOptions,
    behavior: CommitBehavior,
  ): void {
    if (this.batchDepth > 0) {
      this.userOptions = nextOptions;
      this.batchDirty = true;
      this.batchPreserveSeriesState &&= behavior.preserveSeriesState;
      this.batchPreserveAxisRange &&= behavior.preserveAxisRange;
      this.batchNeedsReflow ||= behavior.setupReflow;
      this.batchAnimate ||= behavior.animate;
      return;
    }
    enforceConfiguredValidation(nextOptions);
    this.userOptions = nextOptions;
    this.resolveUpdatedOptions(behavior.preserveSeriesState, behavior.preserveAxisRange);
    if (behavior.setupReflow) this.setupReflow();
    this.animateNext = behavior.animate;
    this.render();
  }

  private flushBatch(): void {
    if (!this.batchDirty || this.destroyed) {
      this.resetBatchFlags();
      return;
    }
    enforceConfiguredValidation(this.userOptions);
    this.resolveUpdatedOptions(
      this.batchPreserveSeriesState,
      this.batchPreserveAxisRange,
    );
    if (this.batchNeedsReflow) this.setupReflow();
    this.animateNext = this.batchAnimate;
    this.render();
    this.resetBatchFlags();
  }

  private resetBatchFlags(): void {
    this.batchDirty = false;
    this.batchPreserveSeriesState = true;
    this.batchPreserveAxisRange = true;
    this.batchNeedsReflow = false;
    this.batchAnimate = false;
  }

  // -- Rendering ---------------------------------------------------------

  /**
   * Drop the axis lines themselves once the container gets too small to
   * read comfortably — leaving just gridlines and the series geometry —
   * rather than rendering an unreadably cramped chart. Data labels, axis
   * labels/titles, and the legend are no longer part of this degradation;
   * they render at whatever size the chart is. Overrides `this.options`
   * (mutable per-instance state) for the duration of this render only;
   * returns a function that restores the originals.
   */
  private applyResponsiveOverrides(): () => void {
    const originals = new Map<string, unknown>();
    const target = this.options as unknown as Record<string, unknown>;
    const remember = (key: string) => {
      if (!originals.has(key)) originals.set(key, target[key]);
    };

    for (const rule of this.options.responsive ?? []) {
      const condition = rule.condition ?? {};
      const matches =
        (condition.minWidth === undefined || this.width >= condition.minWidth) &&
        (condition.maxWidth === undefined || this.width <= condition.maxWidth) &&
        (condition.minHeight === undefined || this.height >= condition.minHeight) &&
        (condition.maxHeight === undefined || this.height <= condition.maxHeight);
      if (!matches) continue;
      for (const [key, value] of Object.entries(rule.options ?? {})) {
        if (value === undefined || key === "series" || key === "responsive")
          continue;
        remember(key);
        target[key] = merge(target[key] as never, value as never);
      }
    }

    const restore = () => {
      for (const [key, value] of originals) target[key] = value;
    };
    if (this.options.chart?.responsive === false) return restore;
    const shortSide = Math.min(this.width, this.height);
    const hideAxisLines = shortSide < 110;
    if (!hideAxisLines) return restore;

    const patch: Partial<AxisOptions> = { lineWidth: 0 };
    const overrideAxis = (
      a: AxisOptions | AxisOptions[] | undefined,
    ): AxisOptions | AxisOptions[] | undefined =>
      Array.isArray(a)
        ? a.map((ax) => ({ ...ax, ...patch }))
        : { ...(a ?? {}), ...patch };
    remember("xAxis");
    remember("yAxis");
    this.options.xAxis = overrideAxis(this.options.xAxis);
    this.options.yAxis = overrideAxis(this.options.yAxis);
    return restore;
  }

  render(): void {
    if (this.destroyed) return;
    const restoreResponsive = this.applyResponsiveOverrides();
    try {
    this.boostHoverCleanups.forEach((cleanup) => cleanup());
    this.boostHoverCleanups = [];
    this.accessiblePoints = [];
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
    this.renderer.create(
      "rect",
      {
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        fill: this.options.chart?.backgroundColor ?? this.theme.backgroundColor,
      },
      this.renderer.root,
    );

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

    const spacing = this.options.chart?.spacing ?? [5, 5, 5, 5];
    let top = spacing[0];
    top += this.renderTitles(top);

    // Legend placement: top / bottom (horizontal strip) or left / right
    // (vertical column). Space is reserved on the chosen side.
    const legendItems = this.buildLegendItems();
    const showLegend =
      this.options.legend?.enabled !== false && legendItems.length > 1;
    const legendPlace = this.legendPlacement();
    const legendVertical = legendPlace === "left" || legendPlace === "right";
    let legendReserveH = 0;
    let legendReserveW = 0;
    if (showLegend) {
      const legendOptions = this.options.legend ?? {};
      if (legendVertical) {
        legendReserveW = Legend.verticalWidth(legendItems, legendOptions);
      } else {
        const legendWidth = this.width - spacing[1] - spacing[3];
        legendReserveH = Legend.horizontalHeight(
          legendItems,
          legendWidth,
          legendOptions,
        );
      }
    }

    const outer: Rect = {
      x: spacing[3] + (legendPlace === "left" ? legendReserveW : 0),
      y: top + (legendPlace === "top" ? legendReserveH : 0),
      width: this.width - spacing[1] - spacing[3] - legendReserveW,
      height: this.height - top - spacing[2] - legendReserveH,
    };

    // Nested (hierarchical x-axis) takes precedence over trellis grids.
    const nestedDims = firstAxis(this.options.xAxis)?.dimensions;
    const t = this.options.trellis;
    const chartType = this.options.chart?.type;
    const vis = () => this.series.filter((s) => s.visible && s.points.length);
    if (chartType === "butterfly") {
      this.renderButterflyPanel(outer, vis());
    } else if (chartType === "radar") {
      this.renderRadarPanel(outer, vis());
    } else if (chartType === "marimekko") {
      this.renderMarimekkoPanel(outer, vis());
    } else if (nestedDims && nestedDims.length >= 1) {
      this.renderNestedPanel(
        outer,
        this.series.filter((s) => s.visible && s.points.length),
        nestedDims,
      );
    } else if (
      t &&
      (t.columns || t.rows) &&
      t.table !== false &&
      t.sharedX !== false &&
      t.sharedY !== false
    ) {
      // Cross-tab table: shared axes, dimension names as row/column headers.
      this.renderTrellisTable(outer, t);
    } else {
      // Independent small-multiple panels (or a single panel when no trellis).
      const panels = this.computePanels(outer);
      const sharedSeries =
        t && (t.columns || t.rows)
          ? this.series.filter((s) => s.visible && s.points.length)
          : undefined;
      for (const panel of panels) {
        this.renderPanel(
          panel,
          sharedSeries
            ? {
                x: t?.sharedX === false ? undefined : sharedSeries,
                y: t?.sharedY === false ? undefined : sharedSeries,
              }
            : undefined,
        );
      }
    }

    // Draw the legend in its reserved area. For `bottom`, anchor to the
    // actual end of the plot/axis content (`outer.bottom`) rather than a
    // fixed offset from the container's bottom edge — otherwise any slack
    // in the axis's own reserve (e.g. a short axis title) shows up as dead
    // space between it and the legend instead of just shrinking the chart.
    if (showLegend) {
      let lx = outer.x;
      let ly = outer.y + outer.height + 14;
      let lw = outer.width;
      let lh = legendReserveH;
      if (legendPlace === "top") {
        ly = top + 12;
      } else if (legendPlace === "left") {
        lx = spacing[3];
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      } else if (legendPlace === "right") {
        lx = outer.x + outer.width + 8;
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      }
      new Legend({
        renderer: this.renderer,
        items: legendItems,
        options: this.options.legend ?? {},
        x: lx,
        y: ly,
        width: lw,
        height: lh,
        layout: legendVertical ? "vertical" : "horizontal",
        onToggle: (i) => this.toggleSeries(i),
      }).render(this.renderer.group({}, this.renderer.root));
    }

    this.applyAccessibility();
    this.installZoom(outer);
    this.drawDrillUp(outer);
    if (this.animateNext) this.animateEnter();
    this.animateNext = false;

    this.events.emit("render", this);
    this.options.chart?.events?.render?.(this);
    } finally {
      restoreResponsive();
    }
  }

  /** Set chart-level semantics after all point marks have been registered. */
  private applyAccessibility(): void {
    const root = this.renderer.root;
    if (this.options.accessibility?.enabled === false) {
      root.removeAttribute("role");
      root.removeAttribute("aria-label");
      root.removeAttribute("aria-roledescription");
      return;
    }
    const label =
      this.options.accessibility?.description ??
      this.options.title?.text ??
      `${this.options.chart?.type ?? "chart"} chart with ${this.series.length} series`;
    // `figure` keeps data-mark descendants exposed. `img` would make the SVG
    // an opaque accessibility node and hide every point label below it.
    root.setAttribute("role", "figure");
    root.setAttribute("aria-roledescription", "chart");
    root.setAttribute("aria-label", label);

    const style = this.renderer.create("style", {}, root);
    style.textContent = `.facet-a11y-point:focus{outline:none}.facet-a11y-point:focus-visible{filter:drop-shadow(0 0 2px ${this.theme.axis.labelColor}) drop-shadow(0 0 2px ${this.theme.axis.labelColor})}`;
  }

  /** Enter animation: bars grow from the baseline, lines draw in, the rest fade. */
  private animateEnter(): void {
    const opt = this.options.chart?.animation;
    if (opt === false) return;
    const cfg = typeof opt === "object" ? opt : {};
    if (
      cfg.enabled === false ||
      typeof (Element.prototype as { animate?: unknown }).animate !== "function"
    )
      return;
    const duration = cfg.duration ?? 600;
    const easing = cfg.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";
    const inverted = this.isInverted(this.series);

    const groups =
      this.renderer.root.querySelectorAll<SVGGElement>(".facet-series");
    groups.forEach((g, gi) => {
      const delay = Math.min(gi * 60, 240);
      const cls = g.getAttribute("class") ?? "";
      if (cls.includes("facet-column") || cls.includes("facet-marimekko")) {
        g.querySelectorAll<SVGElement>("rect.facet-point, rect").forEach(
          (r) => {
            r.style.transformBox = "fill-box";
            r.style.transformOrigin = inverted
              ? "left center"
              : "center bottom";
            r.animate(
              [
                { transform: inverted ? "scaleX(0)" : "scaleY(0)" },
                { transform: "none" },
              ],
              { duration, easing, delay, fill: "backwards" },
            );
          },
        );
      } else if (
        cls.includes("facet-line") ||
        cls.includes("facet-arearange") ||
        cls.includes("facet-radar")
      ) {
        g.querySelectorAll<SVGPathElement>("path").forEach((p) => {
          if (p.getAttribute("fill") !== "none") {
            p.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration,
              easing,
              delay,
              fill: "backwards",
            });
            return;
          }
          const len = p.getTotalLength?.() ?? 0;
          if (!len) return;
          p.style.strokeDasharray = `${len}`;
          const anim = p.animate(
            [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: duration + 200, easing, delay, fill: "backwards" },
          );
          anim.onfinish = () => {
            p.style.strokeDasharray = "";
          };
        });
      } else {
        g.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration, easing, delay, fill: "backwards" },
        );
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
    const type = typeof z === "object" ? z.type : z;
    if (!type) return;
    const st = this.zoomState;
    if (!st) return;
    const xScale = st.xScale as Scale & { invert?(p: number): number };
    const yScale = st.yScale as Scale & { invert?(p: number): number };
    // Each axis is zoomable only if it is continuous (has invert, no bands).
    const canX =
      (type === "x" || type === "xy") &&
      !!xScale?.invert &&
      xScale.bandwidth() === 0;
    const canY =
      (type === "y" || type === "xy") &&
      !!yScale?.invert &&
      yScale.bandwidth() === 0;
    if (!canX && !canY) return;
    const plot = st.plot;
    const root = this.renderer.root;

    const overlay = this.renderer.create(
      "rect",
      {
        x: plot.x,
        y: plot.y,
        width: plot.width,
        height: plot.height,
        fill: "transparent",
        style: "cursor:crosshair",
        class: "facet-zoom-overlay",
      },
      root,
    );

    const clampX = (v: number) =>
      Math.max(plot.x, Math.min(plot.x + plot.width, v));
    const clampY = (v: number) =>
      Math.max(plot.y, Math.min(plot.y + plot.height, v));
    let startX = 0,
      startY = 0;
    let band: SVGRectElement | null = null;

    // The selection rect spans the full plot on any axis that isn't being zoomed.
    const bandRect = (x: number, y: number) => ({
      x: canX ? Math.min(startX, x) : plot.x,
      width: canX ? Math.abs(x - startX) : plot.width,
      y: canY ? Math.min(startY, y) : plot.y,
      height: canY ? Math.abs(y - startY) : plot.height,
    });

    overlay.addEventListener("mousedown", (e: MouseEvent) => {
      startX = clampX(this.localX(e.clientX));
      startY = clampY(this.localY(e.clientY));
      band = this.renderer.create(
        "rect",
        {
          ...bandRect(startX, startY),
          fill: "rgba(37,99,235,0.15)",
          stroke: "rgba(37,99,235,0.6)",
        },
        root,
      ) as SVGRectElement;
      const move = (ev: MouseEvent) => {
        const r = bandRect(
          clampX(this.localX(ev.clientX)),
          clampY(this.localY(ev.clientY)),
        );
        band!.setAttribute("x", String(r.x));
        band!.setAttribute("width", String(r.width));
        band!.setAttribute("y", String(r.y));
        band!.setAttribute("height", String(r.height));
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        const endX = clampX(this.localX(ev.clientX)),
          endY = clampY(this.localY(ev.clientY));
        band?.remove();
        band = null;
        const dragX = canX && Math.abs(endX - startX) >= 6;
        const dragY = canY && Math.abs(endY - startY) >= 6;
        if (!dragX && !dragY) return;
        if (dragX) {
          const a = xScale.invert!(Math.min(startX, endX)),
            b = xScale.invert!(Math.max(startX, endX));
          this.setAxisRange("xAxis", a, b);
        }
        if (dragY) {
          // y range is reversed (larger pixel = smaller value).
          const a = yScale.invert!(Math.max(startY, endY)),
            b = yScale.invert!(Math.min(startY, endY));
          this.setAxisRange("yAxis", a, b);
        }
        this.animateNext = false;
        this.render();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    // Reset control when a zoom is active on either axis.
    const xa = axisAt(this.options.xAxis, 0);
    const ya = axisAt(this.options.yAxis, 0);
    const zoomed =
      xa.min !== undefined ||
      xa.max !== undefined ||
      ya.min !== undefined ||
      ya.max !== undefined;
    if (zoomed) {
      const g = this.renderer.group(
        { class: "facet-zoom-reset", style: "cursor:pointer" },
        root,
      );
      const bx = outer.x + outer.width - 92,
        by = outer.y + 2;
      this.renderer.create(
        "rect",
        {
          x: bx,
          y: by,
          width: 90,
          height: 22,
          rx: 5,
          fill: this.theme.tooltip.backgroundColor,
          stroke: THEME.axis.lineColor,
        },
        g,
      );
      this.renderer.text(
        "⟲ Reset zoom",
        bx + 45,
        by + 15,
        {
          "text-anchor": "middle",
          ...FONTS.axisLabel,
          fill: this.theme.axis.labelColor,
        },
        g,
      );
      g.addEventListener("click", () => {
        this.clearAxisRange("xAxis");
        this.clearAxisRange("yAxis");
        this.animateNext = true;
        this.render();
      });
    }
  }

  /** Set an axis' min/max (single-axis only; leaves multi-axis configs alone). */
  private setAxisRange(
    axis: "xAxis" | "yAxis",
    min: number,
    max: number,
  ): void {
    const cur = this.options[axis];
    if (Array.isArray(cur)) return;
    this.options[axis] = { ...(cur ?? {}), min, max };
  }

  /** Remove min/max from a single-axis config (used by "Reset zoom"). */
  private clearAxisRange(axis: "xAxis" | "yAxis"): void {
    const cur = this.options[axis];
    if (Array.isArray(cur) || !cur) return;
    const { min, max, ...rest } = cur;
    this.options[axis] = rest;
  }

  private renderTitles(top: number): number {
    let used = 0;
    const title = this.options.title;
    if (title?.text && title.enabled !== false) {
      const x = this.titleX(title.align);
      const style = {
        ...FONTS.title,
        ...sanitizeStyle(title.style as Record<string, string>),
      };
      const fontSize = parseFloat(style["font-size"] ?? "18") || 18;
      const baseline = fontSize + 2;
      this.renderer.text(
        title.text,
        x,
        top + baseline + (title.offsetY ?? 0),
        {
          "text-anchor": this.anchor(title.align),
          ...style,
        },
        this.renderer.root,
      );
      used +=
        title.margin === undefined
          ? LAYOUT.titleHeight
          : baseline + title.margin + Math.max(0, title.offsetY ?? 0);
    }
    const sub = this.options.subtitle;
    if (sub?.text && sub.enabled !== false) {
      const x = this.titleX(sub.align);
      const style = {
        ...FONTS.subtitle,
        ...sanitizeStyle(sub.style as Record<string, string>),
      };
      const fontSize = parseFloat(style["font-size"] ?? "13") || 13;
      const baseline = fontSize + 3;
      this.renderer.text(
        sub.text,
        x,
        top + used + baseline + (sub.offsetY ?? 0),
        {
          "text-anchor": this.anchor(sub.align),
          ...style,
        },
        this.renderer.root,
      );
      used +=
        sub.margin === undefined
          ? LAYOUT.subtitleHeight
          : baseline + sub.margin + Math.max(0, sub.offsetY ?? 0);
    }
    return used;
  }

  private titleX(align?: string): number {
    const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    if (align === "left") return spacing[3];
    if (align === "right") return this.width - spacing[1];
    return this.width / 2;
  }

  private anchor(align?: string): string {
    return align === "left" ? "start" : align === "right" ? "end" : "middle";
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
    const gap = t?.gap ?? 24; // Trellis gap in px between panels (default 0).
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
        const series = this.series.map((s) =>
          s.filterByDimensions({ [colDim ?? ""]: cv, [rowDim ?? ""]: rv }),
        );
        const title = [cv, rv].filter((v) => v !== undefined).join(" · ");
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
  private catLabelWidth(
    visible: BaseSeries[],
    opts: AxisOptions = axisAt(this.options.xAxis, 0),
    axisIndex = 0,
  ): number {
    const cats = this.currentCategories(visible, axisIndex) ?? [];
    const label = (value: string) => {
      if (opts.labels?.formatter) return String(opts.labels.formatter(value));
      return opts.labels?.format
        ? formatString(opts.labels.format, { value })
        : value;
    };
    const style = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(opts.labels?.style),
    };
    const measured = cats.reduce(
      (max, category) =>
        Math.max(
          max,
          this.renderer.measureText(label(String(category)), style).width,
        ),
      0,
    );
    return opts.labels?.maxWidth
      ? Math.min(measured, opts.labels.maxWidth)
      : measured;
  }

  /** Estimated px width of the widest value-axis label. */
  private valueLabelWidth(visible: BaseSeries[], valOpts: AxisOptions): number {
    const [dmin, dmax] = this.valueDomain(visible);
    const fmt = (v: number) => {
      if (valOpts.labels?.formatter) return String(valOpts.labels.formatter(v));
      const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
      return valOpts.labels?.format
        ? formatString(valOpts.labels.format, { value: r })
        : String(r);
    };
    const style = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(valOpts.labels?.style),
    };
    const measured = Math.max(
      this.renderer.measureText(fmt(dmin), style).width,
      this.renderer.measureText(fmt(dmax), style).width,
      this.renderer.measureText(fmt((dmin + dmax) / 2), style).width,
    );
    return valOpts.labels?.maxWidth
      ? Math.min(measured, valOpts.labels.maxWidth)
      : measured;
  }

  /** Space to reserve for an axis on a given side (vertical → width, else height). */
  /**
   * How many px to shave off a fixed axis-reserve constant as the chart's
   * shorter side shrinks below 300px. A flat reserve stays the same size
   * regardless of chart size, so on a small chart (dashboard card,
   * resizable panel) it ends up as a visibly dead gap that doesn't shrink
   * along with everything else. Ramps from 0 at 300px up to `maxReduce` at
   * 100px and below.
   */
  private smallChartTaper(maxReduce: number): number {
    const shortSide = Math.min(this.width, this.height);
    const t = Math.max(0, Math.min(1, (300 - shortSide) / 200));
    return t * maxReduce;
  }

  private axisReserve(
    opts: AxisOptions,
    side: "top" | "bottom" | "left" | "right",
    labelW: number,
  ): number {
    if (opts.visible === false) return 6;
    const title = opts.title?.text && opts.title.enabled !== false ? 1 : 0;
    const titleExtra = title
      ? 10 +
        (opts.title?.margin ?? 8) +
        Math.max(0, opts.title?.offset ?? 0)
      : 0;
    const horizontalTitleDelta = title
      ? Math.max(0, (opts.title?.margin ?? 14) - 14) +
        Math.max(0, opts.title?.offset ?? 0)
      : 0;
    const labelsOn = opts.labels?.enabled !== false;
    if (side === "left" || side === "right") {
      if (!labelsOn) return LAYOUT.tickLength + 6 + titleExtra;
      const floor = title
        ? LAYOUT.defaultLeftAxisWidth
        : LAYOUT.defaultLeftAxisWidth - this.smallChartTaper(14);
      return Math.max(floor, LAYOUT.tickLength + 8 + labelW + titleExtra);
    }
    // Horizontal axis: rotated labels project downward, so grow the band by the
    // label's vertical extent at that angle.
    const rot =
      opts.labels?.rotation ??
      (opts.labels?.autoRotation?.length
        ? Math.max(...opts.labels.autoRotation.map((value) => Math.abs(value)))
        : 0);
    const rotExtra = rot
      ? Math.abs(Math.sin((rot * Math.PI) / 180)) * labelW
      : 0;
    if (!labelsOn) {
      // Axis#drawTitle still offsets by its fixed `tickLength + 22` even
      // with no labels (its own label-gap term collapses to 0 there) — a
      // title still needs that room. Only the label band itself collapses
      // to just the tick mark.
      return title
        ? LAYOUT.tickLength + 22 + 8 + horizontalTitleDelta
        : LAYOUT.tickLength + 6;
    }
    // The title's own placement (see Axis#drawTitle) already reaches past
    // the tick + label band via `tickLength + labelExtent + 14`, which is
    // roughly what `defaultBottomAxisHeight` alone already covers — so this
    // only needs a small top-up for the title's own text height, not that
    // whole distance again (that used to double-count it and leave a big
    // gap below the title before anything else, like a legend, started).
    // The band itself only tapers when there's no title, since the title's
    // placement above isn't itself responsive to chart size.
    const base = title
      ? LAYOUT.defaultBottomAxisHeight
      : LAYOUT.defaultBottomAxisHeight - this.smallChartTaper(10);
    return base + (title ? 8 : 0) + horizontalTitleDelta + rotExtra;
  }

  private renderPanel(
    panel: PanelSpec,
    shared?: { x?: BaseSeries[]; y?: BaseSeries[] },
  ): void {
    const visible = panel.series.filter((s) => s.visible && s.points.length);
    if (!visible.length) return;

    const cartesian = visible.some((s) => s.capabilities().cartesian);
    const inverted = this.isInverted(visible);

    // Panel title (trellis).
    let plot = panel.rect;
    if (panel.title) {
      this.renderer.text(
        panel.title,
        plot.x + plot.width / 2,
        plot.y + 12,
        {
          "text-anchor": "middle",
          ...FONTS.subtitle,
          "font-weight": "600",
        },
        this.renderer.root,
      );
      plot = { ...plot, y: plot.y + 20, height: plot.height - 20 };
    }

    if (cartesian && this.options.chart?.polar) {
      this.renderCartesianPolarPanel(plot, visible);
      return;
    }

    if (!cartesian) {
      this.renderPolarPanel(plot, visible);
      return;
    }

    // xAxis is the category axis, yAxis the value axis. When the chart is
    // inverted the category axis becomes vertical (left/right) and the value
    // axis horizontal (bottom/top) — so their options and reserved sides swap.
    const catOpts = firstAxis(this.options.xAxis) ?? {};
    const catOpts2 = axisAt(this.options.xAxis, 1);
    const valOpts = axisAt(this.options.yAxis, 0);
    const catSide = inverted
      ? catOpts.opposite
        ? "right"
        : "left"
      : catOpts.opposite
        ? "top"
        : "bottom";
    const valSide = inverted
      ? valOpts.opposite
        ? "top"
        : "bottom"
      : valOpts.opposite
        ? "right"
        : "left";

    // Secondary y-axis: a series bound via `series.yAxis: 1` gets its own
    // scale on the side opposite the primary axis.
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const renderSecondary = !inverted && visible.some(onSecondary);
    const valOpts2 = renderSecondary
      ? axisAt(this.options.yAxis, 1)
      : undefined;
    const secondaryYSide =
      valOpts2?.opposite === undefined
        ? valSide === "right"
          ? "left"
          : "right"
        : valOpts2.opposite
          ? "right"
          : "left";
    const onSecondaryX = (s: BaseSeries) => (s.options.xAxis ?? 0) === 1;
    const renderSecondaryX = !inverted && visible.some(onSecondaryX);
    const secondaryXSide =
      catOpts2.opposite === undefined
        ? catSide === "top"
          ? "bottom"
          : "top"
        : catOpts2.opposite
          ? "top"
          : "bottom";

    const catReserve = this.axisReserve(
      catOpts,
      catSide,
      this.catLabelWidth(visible),
    );
    const valReserve = this.axisReserve(
      valOpts,
      valSide,
      this.valueLabelWidth(visible, valOpts),
    );
    const pad = { left: 8, right: 8, top: 6, bottom: 6 };
    pad[catSide] = catReserve;
    pad[valSide] = valReserve;
    if (renderSecondaryX) {
      pad[secondaryXSide] = Math.max(
        pad[secondaryXSide],
        this.axisReserve(
          catOpts2,
          secondaryXSide,
          this.catLabelWidth(
            visible.filter(onSecondaryX),
            catOpts2,
            1,
          ),
        ),
      );
    }
    if (renderSecondary && valOpts2) {
      pad[secondaryYSide] = Math.max(
        pad[secondaryYSide],
        this.axisReserve(
          valOpts2,
          secondaryYSide,
          this.valueLabelWidth(visible.filter(onSecondary), valOpts2),
        ),
      );
    }
    const axisPlot: Rect = {
      x: plot.x + pad.left,
      y: plot.y + pad.top,
      width: plot.width - pad.left - pad.right,
      height: plot.height - pad.top - pad.bottom,
    };

    computeStacks(visible);
    const { xScale, xScale2, yScale, yScale2 } = this.buildScales(
      visible,
      axisPlot,
      inverted,
      shared,
    );
    const group = this.groupInfo(visible);
    // Category scale is vertical (yScale) when inverted, else horizontal (xScale).
    const catScale = inverted ? yScale : xScale;
    const valScale = inverted ? xScale : yScale;

    // Axes.
    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root,
    );
    // Slope charts read as a set of vertical category "rails" with the
    // slope lines strung across them, Tufte-style — no axis baseline and no
    // horizontal value gridlines, just a vertical line at each x-category
    // (drawn via the category axis's own gridline mechanism, forced on).
    const isSlope =
      visible.length > 0 && visible.every((s) => s.type === "slope");
    const catAxis = new Axis({
      renderer: this.renderer,
      scale: catScale,
      position: catSide,
      plot: axisPlot,
      options: isSlope
        ? {
            ...catOpts,
            lineWidth: 0,
            ticks: false,
            gridLineWidth: catOpts.gridLineWidth ?? 1,
          }
        : catOpts,
      // Off by default (matching the usual column/bar look), but honour an
      // explicit `gridLineWidth` — currently the only way to opt in, since
      // a category scale never gets "nice" numeric ticks to derive one from.
      grid: isSlope ? true : !!catOpts.gridLineWidth,
    });
    catAxis.render(axisLayer);
    let catAxis2: Axis | undefined;
    if (renderSecondaryX && xScale2) {
      catAxis2 = new Axis({
        renderer: this.renderer,
        scale: xScale2,
        position: secondaryXSide,
        plot: axisPlot,
        options: {
          ...catOpts2,
          opposite: secondaryXSide === "top",
        },
        grid: false,
      });
      catAxis2.render(axisLayer);
    }
    const valAxis = new Axis({
      renderer: this.renderer,
      scale: valScale,
      position: valSide,
      plot: axisPlot,
      options: isSlope ? { ...valOpts, lineWidth: 0 } : valOpts,
      grid: !isSlope,
    });
    valAxis.render(axisLayer);
    let valAxis2: Axis | undefined;
    if (renderSecondary && valOpts2 && yScale2) {
      valAxis2 = new Axis({
        renderer: this.renderer,
        scale: yScale2,
        position: secondaryYSide,
        plot: axisPlot,
        options: valOpts2,
        grid: false,
      });
      valAxis2.render(axisLayer);
    }

    // Remember the plot + scales for drag-zoom and crosshair (single-panel).
    this.plotCtx = { plot: axisPlot, xScale, xScale2, yScale, inverted };
    this.zoomState = !inverted ? { plot: axisPlot, xScale, yScale } : undefined;

    // Series. High-volume point/line series are drawn to a canvas overlay.
    // A series bound to the secondary axis uses its own scale for both
    // positioning and boost rendering.
    const yScaleFor = (s: BaseSeries) =>
      yScale2 && onSecondary(s) ? yScale2 : yScale;
    const xScaleFor = (s: BaseSeries) =>
      xScale2 && onSecondaryX(s) ? xScale2 : xScale;
    const boost = !inverted && this.boostEnabled(visible);
    const cctx = boost ? this.createBoostCanvas(axisPlot) : null;
    const hits: BoostHit[] = [];
    renderAnnotations({
      renderer: this.renderer,
      plot: axisPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      xScale2,
      yScale,
      yScale2,
      layer: "below",
    });
    const existing = new Set(this.renderer.root.children);
    for (const s of visible) {
      const sx = xScaleFor(s);
      const sy = yScaleFor(s);
      if (cctx && this.isBoostable(s)) {
        this.drawBoostSeries(s, cctx, sx, sy, hits);
      } else {
        const ctx = this.seriesContext(
          s,
          axisPlot,
          sx,
          sy,
          group,
          inverted,
          false,
        );
        s.render(ctx);
      }
    }
    // Clip series content to the plot so off-range data (e.g. after zoom) can't
    // spill past the axes.
    this.clipToPlot(axisPlot, existing);
    if (cctx) this.installBoostHover(axisPlot, hits);

    renderAnnotations({
      renderer: this.renderer,
      plot: axisPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      xScale2,
      yScale,
      yScale2,
      layer: "above",
    });

    // Plot lines flagged `zIndex: 'above'` paint on top of the series just
    // rendered (a fresh, later-in-DOM group, so it wins the SVG paint order).
    const aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root,
    );
    catAxis.renderAbove(aboveLayer);
    catAxis2?.renderAbove(aboveLayer);
    valAxis.renderAbove(aboveLayer);
    valAxis2?.renderAbove(aboveLayer);
  }

  /** Clip the series groups added since `existing` was captured to the plot rect. */
  private clipToPlot(plot: Rect, existing: Set<Element>): void {
    const NS = "http://www.w3.org/2000/svg";
    const root = this.renderer.root;
    let defs = root.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(NS, "defs");
      root.insertBefore(defs, root.firstChild);
    }
    const id = `facet-clip-${++this.clipSeq}`;
    const cp = document.createElementNS(NS, "clipPath");
    cp.setAttribute("id", id);
    const rect = document.createElementNS(NS, "rect");
    // A couple of px of slack so edge markers aren't harshly cut.
    rect.setAttribute("x", String(plot.x - 2));
    rect.setAttribute("y", String(plot.y - 2));
    rect.setAttribute("width", String(plot.width + 4));
    rect.setAttribute("height", String(plot.height + 4));
    cp.appendChild(rect);
    defs.appendChild(cp);

    for (const el of Array.from(root.children)) {
      if (existing.has(el)) continue;
      const cls = el.getAttribute("class") ?? "";
      if (cls.includes("facet-series") || cls.includes("facet-boost"))
        el.setAttribute("clip-path", `url(#${id})`);
    }
  }

  // -- Boost (high-volume canvas rendering) ------------------------------

  private static readonly BOOSTABLE = new Set([
    "scatter",
    "jitter",
    "bubble",
    "line",
    "spline",
    "step",
    "area",
    "areaspline",
  ]);

  private isBoostable(s: BaseSeries): boolean {
    // Stacked series need a per-point baseline that the canvas fast path does
    // not model; keep those on the SVG renderer for correctness.
    return !s.options.stacking && FacetViz.BOOSTABLE.has(s.type);
  }

  private boostEnabled(visible: BaseSeries[]): boolean {
    const b = this.options.chart?.boost;
    if (b === false) return false;
    const enabled = typeof b === "object" ? b.enabled : b;
    if (enabled) return true;
    const threshold = (typeof b === "object" && b.threshold) || 1500;
    return visible.some(
      (s) => this.isBoostable(s) && s.points.length > threshold,
    );
  }

  /** A canvas overlay sized to the plot, drawing in the SVG coordinate system. */
  private createBoostCanvas(plot: Rect): CanvasRenderingContext2D | null {
    const fo = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "foreignObject",
    );
    fo.setAttribute("x", String(plot.x));
    fo.setAttribute("y", String(plot.y));
    fo.setAttribute("width", String(plot.width));
    fo.setAttribute("height", String(plot.height));
    fo.setAttribute("class", "facet-boost");
    const canvas = document.createElement("canvas");
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    canvas.width = Math.max(1, Math.round(plot.width * dpr));
    canvas.height = Math.max(1, Math.round(plot.height * dpr));
    canvas.style.width = `${plot.width}px`;
    canvas.style.height = `${plot.height}px`;
    fo.appendChild(canvas);
    this.renderer.root.appendChild(fo);
    let c: CanvasRenderingContext2D | null = null;
    try {
      c = canvas.getContext("2d");
    } catch {
      c = null;
    }
    if (!c) {
      fo.remove();
      return null;
    } // no canvas support → fall back to SVG
    c.scale(dpr, dpr);
    c.translate(-plot.x, -plot.y); // draw using SVG coordinates
    return c;
  }

  private drawBoostSeries(
    s: BaseSeries,
    c: CanvasRenderingContext2D,
    xScale: Scale,
    yScale: Scale,
    hits: BoostHit[],
  ): void {
    const color = s.color;
    if (["line", "spline", "step", "area", "areaspline"].includes(s.type)) {
      let raw: Array<{ x: number; y: number; point: Point }> = [];
      const drawSegment = () => {
        if (!raw.length) return;
        const pts = decimateLine(raw);
        c.beginPath();
        pts.forEach((p, i) =>
          i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y),
        );
        if (s.type.startsWith("area")) {
          const zeroY = yScale.scale(0);
          c.lineTo(pts[pts.length - 1].x, zeroY);
          c.lineTo(pts[0].x, zeroY);
          c.closePath();
          c.fillStyle = alpha(color, s.options.fillOpacity ?? 0.35);
          c.fill();
        }
        c.strokeStyle = color;
        c.lineWidth = s.options.lineWidth ?? s.options.size ?? 2;
        c.lineJoin = "round";
        c.stroke();
        for (const p of raw) {
          hits.push({ x: p.x, y: p.y, point: p.point, series: s });
          if (s.options.marker?.enabled === true) {
            const marker = s.options.marker;
            this.drawCanvasMarker(c, p.x, p.y, {
              marker,
              radius: p.point.options.radius ?? marker.radius ?? 4,
              fill: p.point.color ?? marker.fillColor ?? color,
              stroke: marker.lineColor ?? "#ffffff",
              strokeWidth: marker.lineWidth ?? 1,
            });
          }
        }
        raw = [];
      };
      for (const point of s.points) {
        if (point.y === undefined) {
          drawSegment();
          continue;
        }
        raw.push({
          x: xScale.scale(point.x),
          y: yScale.scale(point.y),
          point,
        });
      }
      drawSegment();
    } else {
      // scatter / jitter / bubble
      const zs =
        s.type === "bubble"
          ? s.points.map((p) => (p.options.z as number) ?? 1)
          : [];
      const [zMin, zMax] = extent(zs);
      const [rMin, rMax] = s.options.sizeRange ?? [6, 34];
      const rng = seededRandom(s.index * 7919 + s.points.length + 1);
      const jitterBand =
        xScale instanceof CategoryScale ? xScale.bandwidth() : 0;
      const jitterSpread = (s.options.jitter ?? 0.5) * jitterBand;
      const marker = s.options.marker ?? {};
      for (const p of s.points) {
        if (p.y === undefined) continue;
        let px = xScale.scale(p.x);
        const py = yScale.scale(p.y);
        if (s.type === "jitter" && jitterBand > 0)
          px += (rng() - 0.5) * jitterSpread;
        let r =
          p.options.radius ??
          s.options.radius ??
          s.options.size ??
          marker.radius ??
          5;
        if (s.type === "bubble") {
          const t =
            zMax === zMin
              ? 1
              : (((p.options.z as number) ?? 1) - zMin) / (zMax - zMin);
          r = Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
        }
        if (marker.enabled !== false) {
          const base = p.color ?? color;
          this.drawCanvasMarker(c, px, py, {
            marker,
            radius: r,
            fill:
              marker.fillColor ??
              (s.type === "bubble" ? alpha(base, 0.55) : base),
            stroke: marker.lineColor ?? (s.type === "bubble" ? base : "#ffffff"),
            strokeWidth: marker.lineWidth ?? 1,
          });
        }
        hits.push({ x: px, y: py, point: p, series: s });
      }
    }
  }

  /** Canvas equivalent of the shared SVG marker renderer used in boost mode. */
  private drawCanvasMarker(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    spec: {
      marker: MarkerOptions;
      radius: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
    },
  ): void {
    const { marker, radius: r } = spec;
    c.beginPath();
    switch (marker.symbol ?? "circle") {
      case "square":
        c.rect(x - r, y - r, r * 2, r * 2);
        break;
      case "diamond":
        c.moveTo(x, y - r);
        c.lineTo(x + r, y);
        c.lineTo(x, y + r);
        c.lineTo(x - r, y);
        c.closePath();
        break;
      case "triangle":
        c.moveTo(x, y - r);
        c.lineTo(x + r, y + r);
        c.lineTo(x - r, y + r);
        c.closePath();
        break;
      case "rectangle": {
        const width = marker.width ?? r * 2;
        const height = marker.height ?? r * 2;
        c.rect(x - width / 2, y - height / 2, width, height);
        break;
      }
      default:
        c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fillStyle = spec.fill;
    c.fill();
    if (spec.strokeWidth > 0) {
      c.strokeStyle = spec.stroke;
      c.lineWidth = spec.strokeWidth;
      c.stroke();
    }
  }

  /** Nearest-point hover for boosted series (no per-point DOM nodes). */
  private installBoostHover(plot: Rect, hits: BoostHit[]): void {
    if (!this.tooltip || !hits.length) return;
    let marker: SVGElement | undefined;
    let active: BoostHit | null = null;
    const root = this.renderer.root;
    const onMove = (e: MouseEvent) => {
      const mx = this.localX(e.clientX),
        my = this.localY(e.clientY);
      if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
      ) {
        marker?.remove();
        marker = undefined;
        if (active) {
          this.handlePointEvent("mouseOut", active.series, active.point, e);
          this.tooltip!.hide();
        }
        active = null;
        return;
      }
      let best: BoostHit | null = null,
        bd = 400; // 20px radius²
      for (const h of hits) {
        const dx = h.x - mx,
          dy = h.y - my,
          d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      marker?.remove();
      marker = undefined;
      if (!best) {
        if (active)
          this.handlePointEvent("mouseOut", active.series, active.point, e);
        active = null;
        this.tooltip!.hide();
        return;
      }
      if (active !== best) {
        if (active)
          this.handlePointEvent("mouseOut", active.series, active.point, e);
        this.handlePointEvent("mouseOver", best.series, best.point, e);
        active = best;
      }
      marker = this.renderer.create(
        "circle",
        {
          cx: best.x,
          cy: best.y,
          r: 5,
          fill: "none",
          stroke: best.series.color,
          "stroke-width": 2,
          "pointer-events": "none",
        },
        root,
      );
      const p = best.point,
        s = best.series;
      this.tooltip!.show(
        {
          series: s.name,
          x: p.name ?? p.x,
          y: p.y,
          name: p.name ?? p.x,
          point: p.options,
          color: p.color ?? s.color,
        },
        s.options.tooltip,
      );
      this.tooltip!.move(e.clientX, e.clientY);
    };
    const onLeave = (e: MouseEvent) => {
      marker?.remove();
      marker = undefined;
      if (active)
        this.handlePointEvent("mouseOut", active.series, active.point, e);
      active = null;
      this.tooltip!.hide();
    };
    const onClick = (e: MouseEvent) => {
      if (active) this.handlePointEvent("click", active.series, active.point, e);
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("click", onClick);
    this.boostHoverCleanups.push(() => {
      marker?.remove();
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("click", onClick);
    });
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
    const gap = t.gap ?? 0;

    const allVisible = this.series.filter((s) => s.visible && s.points.length);
    const categories = this.currentCategories(allVisible);
    const xOpts = firstAxis(this.options.xAxis) ?? {};
    const yOpts0 = axisAt(this.options.yAxis, 0);
    // Horizontal bars: category axis becomes vertical (left), value axis
    // horizontal (bottom) — the same swap `renderPanel` applies for
    // `chart.type: 'bar'`/`chart.inverted`, reshuffling the pivot-table
    // gutters (see leftReserve/bottomReserve below) to match.
    const inverted = this.isInverted(allVisible);

    // Dual axis: series bound via `series.yAxis: 1` get their own shared
    // scale/axis (right side), same convention as the non-trellis panels.
    // Only meaningful for the standard (non-inverted) layout.
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const secondaryVisible = allVisible.filter(onSecondary);
    const hasSecondary = !inverted && secondaryVisible.length > 0;
    const primaryVisible = hasSecondary
      ? allVisible.filter((s) => !onSecondary(s))
      : allVisible;
    const yOpts1 = hasSecondary ? axisAt(this.options.yAxis, 1) : undefined;

    // Series filtered down to one cell's (column, row) dimension values —
    // shared by the pre-pass below and the actual per-cell render loop.
    const cellSeriesFor = (
      cv: string | number | undefined,
      rv: string | number | undefined,
    ): BaseSeries[] => {
      const filter: Record<string, unknown> = {};
      if (colDim) filter[colDim] = cv;
      if (rowDim) filter[rowDim] = rv;
      return this.series
        .map((s) => s.filterByDimensions(filter))
        .filter((s) => s.visible && s.points.length);
    };

    // Stack every cell *before* reading the shared value domain — otherwise
    // a stacked column/bar's rendered (summed) height is invisible to the
    // axis, which only sees each series' own unstacked max and comes up
    // short. `computeStacks` mutates points in place and cells never share
    // points, so running it once per cell up front is enough; the render
    // loop's own `computeStacks` call below just re-confirms the same result.
    for (const rv of rowVals) {
      for (const cv of colVals) {
        computeStacks(cellSeriesFor(cv, rv));
      }
    }

    // Shared value domain (so every cell is directly comparable).
    let [vMin, vMax] = this.valueDomain(
      primaryVisible.length ? primaryVisible : allVisible,
    );
    if (
      (primaryVisible.length ? primaryVisible : allVisible).some((s) =>
        ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type),
      )
    ) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }
    // Headroom above the tallest bar/point — without it, a data max that
    // happens to land exactly on a "nice" tick (e.g. 10) maps to the very
    // top of the shared axis with nothing above it. Skipped when the user
    // sets an explicit max.
    if (yOpts0.max === undefined) {
      const span = vMax - vMin || Math.abs(vMax) || 1;
      vMax += span * 0.08;
    }

    let vMin2 = 0;
    let vMax2 = 1;
    if (hasSecondary && yOpts1) {
      [vMin2, vMax2] = this.valueDomain(secondaryVisible);
      if (
        secondaryVisible.some((s) =>
          ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type),
        )
      ) {
        vMin2 = Math.min(vMin2, 0);
        vMax2 = Math.max(vMax2, 0);
      }
      if (yOpts1.max === undefined) {
        const span2 = vMax2 - vMin2 || Math.abs(vMax2) || 1;
        vMax2 += span2 * 0.08;
      }
    }

    // Gutters: header labels + shared axis space, laid out like a pivot
    // table — column field + values as a header row on top, row field +
    // values as a header column on the left (both horizontal, like normal
    // table headers), the row field name once in the top-left corner cell.
    // Divider lines carry the nested-axis convention used elsewhere in the
    // library (plain bold labels, thin full-span separators, no boxed/shaded
    // chrome) so a trellis chart still reads consistently with the rest of
    // the library. The row/column headers already say what's split, so the
    // (optional) y-axis title is drawn once for the whole grid rather than
    // repeated per row.
    const dimNameRowH = 16;
    const rowValueColW = rowDim
      ? Math.max(
          32,
          Math.max(
            rowDim.length,
            ...rowVals
              .filter((v) => v !== undefined)
              .map((v) => String(v).length),
            0,
          ) *
            6.6 +
            4,
        )
      : 0;
    // Tight tick-label width for these actual values, rather than the fixed
    // generic axis width — keeps the left gutter close to the numbers.
    // Inverted: the left axis carries categories (text), not values.
    const leftTitle = inverted ? xOpts.title : yOpts0.title;
    const titleReserveLeft =
      leftTitle?.text && leftTitle.enabled !== false
        ? 18 +
          Math.max(0, (leftTitle.margin ?? 8) - 8) +
          Math.max(0, leftTitle.offset ?? 0)
        : 0;
    const tickLabelW =
      LAYOUT.tickLength +
      8 +
      (inverted
        ? this.catLabelWidth(allVisible)
        : this.valueLabelWidth(
            primaryVisible.length ? primaryVisible : allVisible,
            yOpts0,
          ));
    const colHeaderH = colDim ? dimNameRowH + 20 : rowDim ? dimNameRowH : 0;
    const rowHeaderW = rowDim ? rowValueColW : 0;
    const leftReserve = rowHeaderW + tickLabelW + titleReserveLeft;
    const titleReserveRight =
      hasSecondary && yOpts1?.title?.text && yOpts1.title.enabled !== false
        ? 18 +
          Math.max(0, (yOpts1.title.margin ?? 8) - 8) +
          Math.max(0, yOpts1.title.offset ?? 0)
        : 0;
    const rightReserve =
      hasSecondary && yOpts1
        ? LAYOUT.tickLength +
          8 +
          this.valueLabelWidth(secondaryVisible, yOpts1) +
          titleReserveRight
        : 0;
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;

    const gridX = outer.x + leftReserve;
    const gridY = outer.y + colHeaderH;
    const gridW = outer.width - leftReserve - rightReserve;
    const gridH = outer.height - colHeaderH - bottomReserve;
    const cellW = (gridW - gap * (colVals.length - 1)) / colVals.length;
    const cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length;
    const lineColor = THEME.axis.lineColor;

    const headerLayer = this.renderer.group(
      { class: "facet-trellis-headers" },
      this.renderer.root,
    );
    // Shared bottom extent for every full-height vertical divider, so they
    // all end at the same point, just past the shared bottom axis.
    const dividerBottom = gridY + gridH + LAYOUT.tickLength + 12;

    // Y-axis title(s): each row draws its own copy next to its axis (see the
    // per-cell Axis calls below), the same convention as the tick labels.

    // Column headers across the top, with full-height divider lines carrying
    // down through the shared bottom axis — the same visual language as the
    // nested x-axis's group separators.
    if (colDim) {
      this.renderer.text(
        colDim,
        gridX + gridW / 2,
        outer.y + dimNameRowH / 2 + 4,
        {
          "text-anchor": "middle",
          ...FONTS.axisTitle,
        },
        headerLayer,
      );
      colVals.forEach((cv, ci) => {
        if (cv === undefined) return;
        const cx = gridX + ci * (cellW + gap) + cellW / 2;
        this.renderer.text(
          String(cv),
          cx,
          outer.y + dimNameRowH + 17,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": "600",
            fill: THEME.axis.titleColor,
          },
          headerLayer,
        );
        if (ci > 0) {
          const dx = gridX + ci * (cellW + gap) - gap / 2;
          // Starts below the (single, shared) dimension-name label so it
          // never cuts through it — the label isn't repeated per column.
          this.renderer.create(
            "line",
            {
              x1: dx,
              y1: outer.y + dimNameRowH,
              x2: dx,
              y2: dividerBottom,
              stroke: lineColor,
              "stroke-width": 1,
            },
            headerLayer,
          );
        }
      });
    }

    // Row header down the left side — a pivot-table row-header column: the
    // dimension name once in the top-left corner cell, then each row's value
    // as normal (unrotated) text next to its cell, with full-width dividers.
    if (rowDim) {
      // Align the corner label with the column *values* row (Tech/Furniture),
      // not centred across the whole header band — it reads as one row of
      // header labels instead of floating between "cat" and the values.
      const rowDimNameY = colDim
        ? outer.y + dimNameRowH + 17
        : outer.y + colHeaderH / 2 + 4;
      this.renderer.text(
        rowDim,
        outer.x + rowHeaderW / 2,
        rowDimNameY,
        {
          "text-anchor": "middle",
          ...FONTS.axisTitle,
        },
        headerLayer,
      );
      rowVals.forEach((rv, ri) => {
        if (rv === undefined) return;
        const cy = gridY + ri * (cellH + gap) + cellH / 2 + 4;
        this.renderer.text(
          String(rv),
          outer.x + rowHeaderW / 2,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": "600",
            fill: THEME.axis.titleColor,
          },
          headerLayer,
        );
        if (ri > 0) {
          const dy = gridY + ri * (cellH + gap) - gap / 2;
          this.renderer.create(
            "line",
            {
              x1: outer.x,
              y1: dy,
              x2: outer.x + outer.width,
              y2: dy,
              stroke: lineColor,
              "stroke-width": 1,
            },
            headerLayer,
          );
        }
      });
      // Separates the row-header column (region / East / West) from the axis
      // and plot area.
      this.renderer.create(
        "line",
        {
          x1: gridX, //outer.x + rowHeaderW,
          y1: outer.y,
          x2: gridX, // outer.x + rowHeaderW,
          y2: dividerBottom, // gridY,
          stroke: lineColor,
          "stroke-width": 1,
        },
        headerLayer,
      );

      // Closes off the right edge of the header/grid box, mirroring the
      // left divider above — the axis label/title gutters (primary on the
      // left, secondary on the right, when present) sit outside this box.
      this.renderer.create(
        "line",
        {
          x1: gridX + gridW,
          y1: outer.y,
          x2: gridX + gridW,
          y2: dividerBottom,
          stroke: lineColor,
          "stroke-width": 1,
        },
        headerLayer,
      );
    }

    // Separates the top header band (region corner / cat + values) from the
    // grid below.
    if (colHeaderH) {
      this.renderer.create(
        "line",
        {
          x1: outer.x,
          y1: gridY,
          x2: outer.x + outer.width,
          y2: gridY,
          stroke: lineColor,
          "stroke-width": 1,
        },
        headerLayer,
      );
    }

    // Separates the bottom of the grid from the shared x-axis below it. The
    // axis itself is drawn by the Axis class, but this divider line is a
    // visual cue that the axis belongs to all cells, not just the last row.
    this.renderer.create(
      "line",
      {
        x1: outer.x,
        y1: outer.y + outer.height - bottomReserve,
        x2: outer.x + outer.width,
        y2: outer.y + outer.height - bottomReserve,
        stroke: lineColor,
        "stroke-width": 1,
      },
      headerLayer,
    );

    // Each cell.
    rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        const cell: Rect = {
          x: gridX + ci * (cellW + gap),
          y: gridY + ri * (cellH + gap),
          width: cellW,
          height: cellH,
        };
        const cellSeries = cellSeriesFor(cv, rv);

        // Category scale: horizontal (bottom axis) normally, or vertical
        // (left axis) when inverted — the same role-swap `renderPanel`
        // applies for bar charts.
        const catRange: [number, number] = inverted
          ? [cell.y, cell.y + cell.height]
          : [cell.x, cell.x + cell.width];
        const catScale = categories
          ? new CategoryScale({ categories, range: catRange })
          : new LinearScale({
              domain: this.xNumericDomain(
                cellSeries.length ? cellSeries : allVisible,
              ),
              range: catRange,
            });
        const dropLastTick = (sc: Scale, range: [number, number]): Scale => {
          // Drop the max-value tick — it sits right against a divider and
          // reads as clutter there: the top header divider when the value
          // axis is vertical (normal), or the right-hand column
          // divider/closing border when it's horizontal (inverted). Same
          // domain/range either way, so bars plot identically; only the
          // tick/gridline/label list shrinks.
          if (sc instanceof LinearScale) {
            const allTicks = sc.ticks();
            if (allTicks.length > 1) {
              return new LinearScale({
                domain: sc.domain,
                range,
                ticks: allTicks.slice(0, -1),
              });
            }
          }
          return sc;
        };

        const valRange: [number, number] = inverted
          ? [cell.x, cell.x + cell.width]
          : [cell.y + cell.height, cell.y];
        const valScale = dropLastTick(
          this.valueScale(yOpts0, [vMin, vMax], valRange),
          valRange,
        );
        const valScale2 =
          hasSecondary && yOpts1
            ? dropLastTick(
                this.valueScale(
                  yOpts1,
                  [vMin2, vMax2],
                  [cell.y + cell.height, cell.y],
                ),
                [cell.y + cell.height, cell.y],
              )
            : undefined;
        // Physically swap which slot carries category vs. value so series
        // that key off `ctx.xScale`/`ctx.yScale` by type (e.g. `bar`) and
        // ones that key off `ctx.inverted` (e.g. `boxplot`) both resolve
        // the same roles.
        const xScale = inverted ? valScale : catScale;
        const yScale = inverted ? catScale : valScale;
        const yScale2 = valScale2;

        const axisLayer = this.renderer.group(
          { class: "facet-axes" },
          this.renderer.root,
        );
        const isLeft = ci === 0;
        const isRight = ci === colVals.length - 1;
        const isBottom = ri === rowVals.length - 1;
        const catLabelled = inverted ? isLeft : isBottom;
        const valLabelled = inverted ? isBottom : isLeft;

        // Category axis: labelled (no title) on the leftmost column
        // normally / bottom row when inverted; gridlines off unless the
        // caller explicitly asked for them via `xOpts.gridLineWidth`.
        const catAxis = new Axis({
          renderer: this.renderer,
          scale: catScale,
          position: inverted ? "left" : "bottom",
          plot: cell,
          grid: !!xOpts.gridLineWidth,
          options: catLabelled
            ? { ...xOpts, title: undefined, ticks: false }
            : { labels: { enabled: false }, lineWidth: 0, ticks: false },
        });
        catAxis.render(axisLayer);

        // Value axis: labelled (incl. title) on the left column normally /
        // bottom row when inverted, gridlines only elsewhere. Each row
        // draws its own copy of the title (only supported in the
        // non-inverted, left-hand position).
        const valAxis = new Axis({
          renderer: this.renderer,
          scale: valScale,
          position: inverted ? "bottom" : "left",
          plot: cell,
          grid: true,
          options: valLabelled
            ? inverted
              ? { ...yOpts0, title: undefined }
              : yOpts0
            : { labels: { enabled: false }, lineWidth: 0 },
        });
        valAxis.render(axisLayer);

        // Secondary y axis: labelled (incl. title) on the right column only,
        // mirroring the primary axis; drawn without gridlines to avoid a
        // double grid. Only ever set when !inverted (see hasSecondary).
        let rightAxis: Axis | undefined;
        if (hasSecondary && yScale2 && yOpts1) {
          rightAxis = new Axis({
            renderer: this.renderer,
            scale: yScale2,
            position: "right",
            plot: cell,
            grid: false,
            options: isRight
              ? yOpts1
              : { labels: { enabled: false }, lineWidth: 0 },
          });
          rightAxis.render(axisLayer);
        }

        if (cellSeries.length) {
          computeStacks(cellSeries);
          const group = this.groupInfo(cellSeries);
          for (const s of cellSeries) {
            const sy = yScale2 && onSecondary(s) ? yScale2 : yScale;
            const ctx = this.seriesContext(
              s,
              cell,
              xScale,
              sy,
              group,
              inverted,
              false,
            );
            s.render(ctx);
          }
        }

        // Plot lines flagged `zIndex: 'above'` paint on top of this cell's
        // series (a fresh, later-in-DOM group wins the SVG paint order).
        const aboveLayer = this.renderer.group(
          { class: "facet-axes-above" },
          this.renderer.root,
        );
        catAxis.renderAbove(aboveLayer);
        valAxis.renderAbove(aboveLayer);
        rightAxis?.renderAbove(aboveLayer);
      });
    });
  }

  private renderPolarPanel(plot: Rect, visible: BaseSeries[]): void {
    // Pie/radial: no shared scales; dummy scales satisfy the interface.
    const dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    for (const s of visible) {
      const ctx = this.seriesContext(
        s,
        plot,
        dummy,
        dummy,
        { count: 1, index: new Map() },
        false,
        true,
      );
      s.render(ctx);
    }
  }

  /**
   * Project ordinary category/value series into a shared polar coordinate
   * system. Supported renderers opt into polar geometry through their normal
   * SeriesRenderContext, so tooltip, events, labels, stacking, and legends keep
   * the same behavior as their Cartesian equivalents.
   */
  private renderCartesianPolarPanel(plot: Rect, visible: BaseSeries[]): void {
    const supported = new Set<ChartType>([
      "line",
      "spline",
      "step",
      "area",
      "areaspline",
      "scatter",
      "jitter",
      "column",
    ]);
    const series = visible.filter((item) => supported.has(item.type));
    if (!series.length) return;
    computeStacks(series);

    const xOptions = axisAt(this.options.xAxis, 0);
    const yOptions = axisAt(this.options.yAxis, 0);
    const labelStyle = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(xOptions.labels?.style),
    };
    const framePadding =
      xOptions.labels?.enabled === false
        ? 12
        : Math.max(
            24,
            ...series.flatMap((item) =>
              item.points.map(
                (point) =>
                  this.renderer.measureText(String(point.x), labelStyle).width / 2 + 8,
              ),
            ),
          );
    const radius = Math.max(
      1,
      Math.min(plot.width, plot.height) / 2 - Math.min(framePadding, 54),
    );
    const innerRadius = this.resolvePolarInnerRadius(radius);
    const polarPlot: Rect = {
      x: plot.x + plot.width / 2 - radius,
      y: plot.y + plot.height / 2 - radius,
      width: radius * 2,
      height: radius * 2,
    };
    const center = {
      x: polarPlot.x + polarPlot.width / 2,
      y: polarPlot.y + polarPlot.height / 2,
    };

    const categories = this.currentCategories(series);
    const categoryOffset = categories?.length ? Math.PI / categories.length : 0;
    const xScale: Scale = categories
      ? new CategoryScale({
          categories,
          range: [
            -Math.PI / 2 - categoryOffset,
            Math.PI * 1.5 - categoryOffset,
          ],
          padding: 0.12,
          reversed: xOptions.reversed,
        })
      : this.valueScale(
          xOptions,
          this.xNumericDomain(series),
          [-Math.PI / 2, Math.PI * 1.5],
        );

    const onSecondary = (item: BaseSeries) => (item.options.yAxis ?? 0) === 1;
    const primary = series.filter((item) => !onSecondary(item));
    const secondary = series.filter(onSecondary);
    const radialScale = (items: BaseSeries[], options: AxisOptions) => {
      let domain = this.valueDomain(items.length ? items : series);
      if (
        items.some((item) =>
          ["column", "area", "areaspline"].includes(item.type),
        ) &&
        options.type !== "log"
      )
        domain = [Math.min(0, domain[0]), Math.max(0, domain[1])];
      return this.valueScale(options, domain, [innerRadius, radius]);
    };
    const yScale = radialScale(primary, yOptions);
    const yScale2 = secondary.length
      ? radialScale(secondary, axisAt(this.options.yAxis, 1))
      : undefined;

    const project = (angle: number, radial: number) => ({
      x: center.x + Math.cos(angle) * radial,
      y: center.y + Math.sin(angle) * radial,
    });
    const xTicks = xScale.ticks();
    const holeColor =
      this.options.chart?.polarInnerBackgroundColor ??
      this.options.chart?.backgroundColor ??
      this.theme.backgroundColor;
    const drawCategoryLabels = (parent: SVGElement) => {
      if (
        xOptions.visible === false ||
        xOptions.labels?.enabled === false
      )
        return;
      const curved =
        xOptions.labels?.position === "inner" &&
        innerRadius > 0 &&
        !!categories?.length;
      if (curved) {
        const definitions = this.renderer.create("defs", {}, parent);
        const textRadius = Math.max(
          10,
          innerRadius - (xOptions.labels?.offset ?? 7),
        );
        const arcSpan = Math.min(
          Math.PI * 0.9,
          ((Math.PI * 2) / categories!.length) * 0.78,
        );
        for (const tick of xTicks) {
          const angle = xScale.scale(tick);
          const flipped = Math.sin(angle) > 0.05;
          const start = flipped ? angle + arcSpan / 2 : angle - arcSpan / 2;
          const end = flipped ? angle - arcSpan / 2 : angle + arcSpan / 2;
          const from = project(start, textRadius);
          const to = project(end, textRadius);
          const pathId = `facet-polar-label-path-${++this.clipSeq}`;
          this.renderer.create(
            "path",
            {
              id: pathId,
              d: `M ${from.x} ${from.y} A ${textRadius} ${textRadius} 0 0 ${flipped ? 0 : 1} ${to.x} ${to.y}`,
              fill: "none",
              stroke: "none",
            },
            definitions,
          );
          const text = this.renderer.create(
            "text",
            {
              ...labelStyle,
              fill: THEME.axis.labelColor,
              class:
                "facet-polar-category-label facet-polar-curved-label",
            },
            parent,
          );
          const textPath = this.renderer.create(
            "textPath",
            {
              href: `#${pathId}`,
              startOffset: "50%",
              "text-anchor": "middle",
            },
            text,
          );
          textPath.textContent = xScale.tickLabel(tick);
        }
        return;
      }
      const labelRadius = radius + (xOptions.labels?.offset ?? 10);
      for (const tick of xTicks) {
        const angle = xScale.scale(tick);
        const label = project(angle, labelRadius);
        const cosine = Math.cos(angle);
        this.renderer.text(
          xScale.tickLabel(tick),
          label.x,
          label.y,
          {
            ...labelStyle,
            fill: THEME.axis.labelColor,
            "text-anchor":
              cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle",
            "dominant-baseline": "middle",
            class: "facet-polar-category-label",
          },
          parent,
        );
      }
    };
    const axes = this.renderer.group(
      { class: "facet-polar-axes" },
      this.renderer.root,
    );
    if (innerRadius > 0) {
      this.renderer.create(
        "circle",
        {
          cx: center.x,
          cy: center.y,
          r: innerRadius,
          fill: holeColor,
          stroke: "none",
          class: "facet-polar-hole",
        },
        axes,
      );
    }
    const gridColor = yOptions.gridLineColor ?? THEME.axis.gridLineColor;
    if (yOptions.visible !== false) {
      for (const tick of yScale.ticks()) {
        const radial = yScale.scale(tick);
        if (radial < 0 || radial > radius + 0.5) continue;
        this.renderer.create(
          "circle",
          {
            cx: center.x,
            cy: center.y,
            r: radial,
            fill: "none",
            stroke: gridColor,
            "stroke-width": yOptions.gridLineWidth ?? 1,
            class: "facet-polar-ring",
          },
          axes,
        );
        if (yOptions.labels?.enabled !== false) {
          this.renderer.text(
            yScale.tickLabel(tick),
            center.x + 4,
            center.y - radial - 3,
            {
              ...FONTS.axisLabel,
              ...sanitizeStyle(yOptions.labels?.style),
              fill: THEME.axis.labelColor,
              class: "facet-polar-value-label",
            },
            axes,
          );
        }
      }
    }
    if (xOptions.visible !== false) {
      const sectorMode =
        this.options.chart?.polarGridLineMode === "sector" &&
        !!categories?.length;
      const gridAngles = sectorMode
        ? categories!.map(
            (_, index) =>
              -Math.PI / 2 -
              categoryOffset +
              (index * Math.PI * 2) / categories!.length,
          )
        : xTicks.map((tick) => xScale.scale(tick));
      for (const angle of gridAngles) {
        const innerEdge = project(angle, innerRadius);
        const edge = project(angle, radius);
        this.renderer.create(
          "line",
          {
            x1: innerEdge.x,
            y1: innerEdge.y,
            x2: edge.x,
            y2: edge.y,
            stroke: xOptions.gridLineColor ?? THEME.axis.gridLineColor,
            "stroke-width": xOptions.gridLineWidth ?? 1,
            class: sectorMode
              ? "facet-polar-sector-line"
              : "facet-polar-spoke",
          },
          axes,
        );
      }
      drawCategoryLabels(axes);
    }
    if (xOptions.title?.text && xOptions.title.enabled !== false) {
      const centered = xOptions.title.position === "center";
      this.renderer.text(
        xOptions.title.text,
        center.x,
        centered
          ? center.y
          : plot.y + plot.height - (xOptions.title.offset ?? 0),
        {
          ...FONTS.axisTitle,
          ...sanitizeStyle(xOptions.title.style),
          "text-anchor": "middle",
          "dominant-baseline": centered ? "middle" : undefined,
          class: "facet-polar-axis-title facet-polar-x-title",
        },
        axes,
      );
    }
    if (yOptions.title?.text && yOptions.title.enabled !== false)
      {
        const align = yOptions.title.align ?? "center";
        const along = align === "start" ? 0.2 : align === "end" ? 0.8 : 0.5;
        const x =
          plot.x +
          (yOptions.title.margin ?? 8) +
          (yOptions.title.offset ?? 0) +
          6;
        const y = plot.y + plot.height * along;
        this.renderer.text(
          yOptions.title.text,
          x,
          y,
          {
            ...FONTS.axisTitle,
            ...sanitizeStyle(yOptions.title.style),
            "text-anchor":
              align === "start" ? "start" : align === "end" ? "end" : "middle",
            transform: `rotate(-90 ${x} ${y})`,
            class: "facet-polar-axis-title facet-polar-y-title",
          },
          axes,
        );
      }

    renderAnnotations({
      renderer: this.renderer,
      plot: polarPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      yScale,
      yScale2,
      layer: "below",
      project,
    });
    const group = this.groupInfo(series);
    for (const item of series) {
      item.render(
        this.seriesContext(
          item,
          polarPlot,
          xScale,
          yScale2 && onSecondary(item) ? yScale2 : yScale,
          group,
          false,
          true,
        ),
      );
    }
    renderAnnotations({
      renderer: this.renderer,
      plot: polarPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      yScale,
      yScale2,
      layer: "above",
      project,
    });
  }

  private resolvePolarInnerRadius(outerRadius: number): number {
    const value = this.options.chart?.polarInnerSize;
    if (value === undefined) return 0;
    const pixels =
      typeof value === "string"
        ? outerRadius * (parseFloat(value) / 100)
        : value;
    return Math.max(0, Math.min(outerRadius * 0.95, pixels));
  }

  // -- Nested (hierarchical x-axis) ------------------------------

  private renderNestedPanel(
    outer: Rect,
    visible: BaseSeries[],
    dims: string[],
  ): void {
    if (!visible.length) return;
    const agg = firstAxis(this.options.xAxis)?.aggregate ?? "sum";
    const { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;

    // Series carrying only their aggregated leaf points.
    const aggSeries = visible.map((s) =>
      s.withPoints(seriesPoints.get(s.index) ?? []),
    );

    // Horizontal bars: category axis becomes vertical (left, or left+right
    // when split), value axis horizontal (bottom) — the same role-swap
    // `renderPanel`/the trellis table apply for `chart.type:'bar'` /
    // `chart.inverted`. Dual axis is only meaningful in the normal
    // (non-inverted) layout, same convention as elsewhere.
    const inverted = this.isInverted(visible);

    const yOpts0 = axisAt(this.options.yAxis, 0);
    const yOpts1 = axisAt(this.options.yAxis, 1);
    const onAxis = (s: BaseSeries, i: number) => (s.options.yAxis ?? 0) === i;
    const secondary = aggSeries.filter((s) => onAxis(s, 1));
    const hasSecondary = !inverted && secondary.length > 0;

    // Reserve axis space. In split mode (opposite) the innermost dimension is
    // labelled nearest the plot while the outer grouping dimensions sit on
    // the far side.
    const xOpts = firstAxis(this.options.xAxis) ?? {};
    const split = !!xOpts.opposite;
    // Mirrors `axisReserve`'s `visible === false` short-circuit for the
    // plain (non-nested) panel: no line/ticks/labels/dividers drawn, and no
    // space reserved beyond the same minimal 6px sliver.
    const catVisible = xOpts.visible !== false;
    const rowH = 18;
    const rotExtra = !inverted
      ? nestedInnerRotationExtent(leaves, xOpts.labels?.rotation ?? 0)
      : 0;

    let plot: Rect;
    let catScale: CategoryScale;
    let valScale0: Scale;
    let valScale1: Scale;
    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root,
    );
    let valAxis0: Axis;
    let valAxis1: Axis | undefined;

    if (!inverted) {
      const leftReserve =
        LAYOUT.tickLength +
        8 +
        this.valueLabelWidth(
          aggSeries.filter((s) => onAxis(s, 0)),
          yOpts0,
        ) +
        (yOpts0.title?.text && yOpts0.title.enabled !== false
          ? 18 +
            Math.max(0, (yOpts0.title.margin ?? 8) - 8) +
            Math.max(0, yOpts0.title.offset ?? 0)
          : 0);
      const rightReserve = hasSecondary
        ? LAYOUT.tickLength +
          8 +
          this.valueLabelWidth(secondary, yOpts1) +
          (yOpts1.title?.text && yOpts1.title.enabled !== false
            ? 18 +
              Math.max(0, (yOpts1.title.margin ?? 8) - 8) +
              Math.max(0, yOpts1.title.offset ?? 0)
            : 0)
        : 8;
      const bottomReserve = catVisible
        ? LAYOUT.tickLength +
          (split ? 1 : dims.length) * rowH +
          12 +
          rotExtra +
          (xOpts.title?.text && xOpts.title.enabled !== false
            ? 22 +
              Math.max(0, (xOpts.title.margin ?? 14) - 14) +
              Math.max(0, xOpts.title.offset ?? 0)
            : 0)
        : 6;
      const topReserve =
        catVisible && split
          ? LAYOUT.tickLength + (dims.length - 1) * rowH + 8
          : 6;
      plot = {
        x: outer.x + leftReserve,
        y: outer.y + topReserve,
        width: outer.width - leftReserve - rightReserve,
        height: outer.height - topReserve - bottomReserve,
      };

      catScale = new CategoryScale({
        categories: keys,
        range: [plot.x, plot.x + plot.width],
      });
      const range: [number, number] = [plot.y + plot.height, plot.y];
      const scaleFor = (list: BaseSeries[], opts: AxisOptions) => {
        let [lo, hi] = this.valueDomain(list.length ? list : aggSeries);
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
        return this.valueScale(opts, [lo, hi], range);
      };
      valScale0 = scaleFor(
        aggSeries.filter((s) => onAxis(s, 0)),
        yOpts0,
      );
      valScale1 = hasSecondary ? scaleFor(secondary, yOpts1) : valScale0;

      valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "left",
        plot,
        options: yOpts0,
        grid: true,
      });
      valAxis0.render(axisLayer);
      if (hasSecondary) {
        valAxis1 = new Axis({
          renderer: this.renderer,
          scale: valScale1,
          position: "right",
          plot,
          options: yOpts1,
          grid: false,
        });
        valAxis1.render(axisLayer);
      }
      if (catVisible) {
        new NestedAxis({
          renderer: this.renderer,
          scale: catScale,
          plot,
          leaves,
          keys,
          position: split ? "split" : "bottom",
          labels: xOpts.labels,
          title: xOpts.title,
          lineColor: xOpts.lineColor,
          lineWidth: xOpts.lineWidth,
          gridLineColor: xOpts.gridLineColor,
          gridLineWidth: xOpts.gridLineWidth,
        }).render(axisLayer);
      }
    } else {
      // Vertical nested axis: left reserve fits the tier(s) nearest the plot
      // (all tiers stacked when not split, just the innermost when split);
      // the outer grouping tiers get a right reserve only when split.
      const colWidths = nestedLevelWidths(leaves);
      const innerW = colWidths[colWidths.length - 1] ?? 0;
      const outerW = colWidths.slice(0, -1).reduce((a, b) => a + b, 0);
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      const leftReserve = catVisible
        ? LAYOUT.tickLength +
          8 +
          (split ? innerW : totalW) +
          (xOpts.title?.text && xOpts.title.enabled !== false
            ? 22 +
              Math.max(0, (xOpts.title.margin ?? 14) - 14) +
              Math.max(0, xOpts.title.offset ?? 0)
            : 0)
        : 6;
      const rightReserve =
        catVisible && split ? LAYOUT.tickLength + 8 + outerW : 8;
      const bottomReserve =
        LAYOUT.defaultBottomAxisHeight +
        (yOpts0.title?.text && yOpts0.title.enabled !== false
          ? 32 +
            Math.max(0, (yOpts0.title.margin ?? 14) - 14) +
            Math.max(0, yOpts0.title.offset ?? 0)
          : 0);
      const topReserve = 6;
      plot = {
        x: outer.x + leftReserve,
        y: outer.y + topReserve,
        width: outer.width - leftReserve - rightReserve,
        height: outer.height - topReserve - bottomReserve,
      };

      catScale = new CategoryScale({
        categories: keys,
        range: [plot.y, plot.y + plot.height],
      });
      let [lo, hi] = this.valueDomain(aggSeries);
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
      valScale0 = this.valueScale(
        yOpts0,
        [lo, hi],
        [plot.x, plot.x + plot.width],
      );
      valScale1 = valScale0;

      valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "bottom",
        plot,
        options: yOpts0,
        grid: true,
      });
      valAxis0.render(axisLayer);
      if (catVisible) {
        new NestedAxis({
          renderer: this.renderer,
          scale: catScale,
          plot,
          leaves,
          keys,
          position: split ? "split" : "bottom",
          vertical: true,
          labels: xOpts.labels,
          title: xOpts.title,
          lineColor: xOpts.lineColor,
          lineWidth: xOpts.lineWidth,
          gridLineColor: xOpts.gridLineColor,
          gridLineWidth: xOpts.gridLineWidth,
        }).render(axisLayer);
      }
    }

    const group = this.groupInfo(aggSeries);
    const lineFamily = new Set([
      "line",
      "spline",
      "step",
      "area",
      "areaspline",
    ]);
    const existing = new Set(this.renderer.root.children);
    for (const s of aggSeries) {
      const valScale = onAxis(s, 1) ? valScale1 : valScale0;
      const xScale = inverted ? valScale : catScale;
      const yScale = inverted ? catScale : valScale;
      const ctx = this.seriesContext(
        s,
        plot,
        xScale,
        yScale,
        group,
        inverted,
        false,
      );
      if (lineFamily.has(s.type)) {
        // Draw a separate line per first-dimension group so the line does not
        // run continuously across group boundaries.
        let segStart = 0;
        for (let i = 1; i <= s.points.length; i++) {
          const boundary =
            i === s.points.length ||
            leaves[s.points[i].index][0] !==
              leaves[s.points[segStart].index][0];
          if (boundary) {
            s.withPoints(s.points.slice(segStart, i)).render(ctx);
            segStart = i;
          }
        }
      } else {
        s.render(ctx);
      }
    }
    // Clip series content to the plot — a zero-anchored column's baseline is
    // always drawn at true zero, which can land well outside the plot when
    // `yAxis.min` clips the visible domain above it; without this the bar
    // spills straight through the axis labels to the bottom of the chart.
    this.clipToPlot(plot, existing);

    // Plot lines flagged `zIndex: 'above'` paint on top of the series.
    const aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root,
    );
    valAxis0.renderAbove(aboveLayer);
    valAxis1?.renderAbove(aboveLayer);
  }

  // -- Butterfly (tornado) ----------------------------------------------

  /**
   * Two series drawn back-to-back around a central category axis: the first
   * grows leftward, the second rightward, sharing one value scale so the halves
   * are directly comparable (population pyramids, before/after tornadoes).
   */
  private renderButterflyPanel(outer: Rect, visible: BaseSeries[]): void {
    const pair = visible.slice(0, 2);
    if (pair.length < 2) {
      // fall back to a single centred column chart
      const panels = this.computePanels(outer);
      for (const p of panels) this.renderPanel(p);
      return;
    }
    const [leftS, rightS] = pair;
    const categories = this.currentCategories(pair) ?? [];
    const yOpts = firstAxis(this.options.yAxis) ?? {};

    // Shared value maximum across both series → symmetric halves.
    let maxVal = 0;
    for (const s of pair)
      for (const p of s.points) maxVal = Math.max(maxVal, p.y ?? 0);
    maxVal = yOpts.max ?? (maxVal || 1);

    // Reserve: bottom for the two value axes, a central gutter for category names.
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;
    const gutter = 84;
    const plot: Rect = {
      x: outer.x,
      y: outer.y + 6,
      width: outer.width,
      height: outer.height - bottomReserve - 6,
    };
    const halfW = (plot.width - gutter) / 2;
    const leftZeroX = plot.x + halfW; // value 0 for the left series (inner edge)
    const rightZeroX = plot.x + halfW + gutter; // value 0 for the right series
    const centerX = (leftZeroX + rightZeroX) / 2;

    const catScale = new CategoryScale({
      categories,
      range: [plot.y, plot.y + plot.height],
    });
    // Value scales: 0 at the inner edge, maxVal at the outer edge of each half.
    const leftVal = new LinearScale({
      domain: [0, maxVal],
      range: [leftZeroX, plot.x],
    });
    const rightVal = new LinearScale({
      domain: [0, maxVal],
      range: [rightZeroX, plot.x + plot.width],
    });

    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root,
    );
    // Two mirrored value axes along the bottom.
    const leftAxis = new Axis({
      renderer: this.renderer,
      scale: leftVal,
      position: "bottom",
      grid: false,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: undefined },
    });
    leftAxis.render(axisLayer);
    const rightAxis = new Axis({
      renderer: this.renderer,
      scale: rightVal,
      position: "bottom",
      grid: false,
      plot: { x: rightZeroX, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: undefined },
    });
    rightAxis.render(axisLayer);

    // Category names down the central gutter.
    const band = catScale.bandwidth();
    for (const cat of categories) {
      const cy = catScale.scale(cat) + 4;
      this.renderer.text(
        cat,
        centerX,
        cy,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        axisLayer,
      );
    }

    // Series titles above each half.
    this.renderer.text(
      leftS.name,
      plot.x + halfW / 2,
      outer.y + outer.height - 4,
      { "text-anchor": "middle", ...FONTS.axisTitle },
      axisLayer,
    );
    this.renderer.text(
      rightS.name,
      rightZeroX + halfW / 2,
      outer.y + outer.height - 4,
      { "text-anchor": "middle", ...FONTS.axisTitle },
      axisLayer,
    );

    this.drawButterflySide(leftS, catScale, leftVal, leftZeroX, band, "left");
    this.drawButterflySide(
      rightS,
      catScale,
      rightVal,
      rightZeroX,
      band,
      "right",
    );

    // Plot lines flagged `zIndex: 'above'` paint on top of the series.
    const aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root,
    );
    leftAxis.renderAbove(aboveLayer);
    rightAxis.renderAbove(aboveLayer);
  }

  private drawButterflySide(
    s: BaseSeries,
    catScale: CategoryScale,
    valScale: Scale,
    zeroX: number,
    band: number,
    side: "left" | "right",
  ): void {
    const g = this.renderer.group(
      { class: `facet-series facet-butterfly ${s.name}` },
      this.renderer.root,
    );
    const barH = band * 0.8;
    for (const p of s.points) {
      if (p.y === undefined) continue;
      const vx = valScale.scale(p.y);
      const rect = {
        x: Math.min(zeroX, vx),
        y: catScale.scale(p.x) - barH / 2,
        width: Math.max(1, Math.abs(vx - zeroX)),
        height: barH,
      };
      const el = this.renderer.create(
        "rect",
        { ...rect, fill: p.color ?? s.color, class: "facet-point" },
        g,
      );
      this.bindPointInteraction(el, s, p);
      el.addEventListener("click", (e) =>
        this.handlePointEvent("click", s, p, e),
      );
      el.addEventListener("mouseover", (e) =>
        this.handlePointEvent("mouseOver", s, p, e),
      );
      el.addEventListener("mouseout", (e) =>
        this.handlePointEvent("mouseOut", s, p, e),
      );

      const dl = s.options.dataLabels;
      if (dl?.enabled) {
        const text = labelString(dl, {
          x: p.x,
          y: p.y,
          point: p.options,
          series: s.name,
        });
        const outside = (dl.position ?? "outside") !== "inside";
        const lx =
          side === "left"
            ? outside
              ? rect.x - 4
              : rect.x + 4
            : outside
              ? rect.x + rect.width + 4
              : rect.x + rect.width - 4;
        drawDataLabel(
          this.renderer,
          g,
          text,
          {
            x: lx,
            y: rect.y + barH / 2 + 4,
            anchor:
              side === "left"
                ? outside
                  ? "end"
                  : "start"
                : outside
                  ? "start"
                  : "end",
          },
          dl,
        );
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
    const pt = (i: number, v: number) => ({
      x: cx + (v / vMax) * R * Math.cos(angle(i)),
      y: cy + (v / vMax) * R * Math.sin(angle(i)),
    });
    const grid = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root,
    );

    // Concentric grid rings + spokes.
    for (let r = 1; r <= 4; r++) {
      const ring = cats
        .map((_, i) => {
          const p = pt(i, (vMax * r) / 4);
          return `${p.x},${p.y}`;
        })
        .join(" ");
      this.renderer.create(
        "polygon",
        {
          points: ring,
          fill: "none",
          stroke: THEME.axis.gridLineColor,
          "stroke-width": 1,
        },
        grid,
      );
    }
    cats.forEach((cat, i) => {
      const edge = pt(i, vMax);
      this.renderer.create(
        "line",
        {
          x1: cx,
          y1: cy,
          x2: edge.x,
          y2: edge.y,
          stroke: THEME.axis.gridLineColor,
        },
        grid,
      );
      const lp = pt(i, vMax * 1.12);
      this.renderer.text(
        String(cat),
        lp.x,
        lp.y,
        {
          "text-anchor":
            Math.abs(lp.x - cx) < 4 ? "middle" : lp.x > cx ? "start" : "end",
          "dominant-baseline": "middle",
          ...FONTS.axisLabel,
        },
        grid,
      );
    });

    // One polygon per series.
    for (const s of visible) {
      const g = this.renderer.group(
        { class: `facet-series facet-radar ${s.name}` },
        this.renderer.root,
      );
      const pts = cats.map((cat, i) => {
        const p =
          s.points.find((pp) => String(pp.x) === String(cat)) ?? s.points[i];
        return pt(i, p?.y ?? 0);
      });
      const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
      const fillOp = s.options.fillOpacity ?? (s.type === "area" ? 0.3 : 0.12);
      this.renderer.create(
        "polygon",
        {
          points: poly,
          fill: alpha(s.color, fillOp),
          stroke: s.color,
          "stroke-width": s.options.lineWidth ?? s.options.size ?? 2,
        },
        g,
      );
      const marker = s.options.marker ?? {};
      const labelData: Array<{ pt: { x: number; y: number }; p: Point }> = [];
      pts.forEach((p, i) => {
        const point =
          s.points.find((pp) => String(pp.x) === String(cats[i])) ??
          s.points[i];
        if (!point) return;
        const radius = point.options.radius ?? marker.radius ?? 3.5;
        const el = marker.enabled === false
          ? this.renderer.create(
              "circle",
              {
                cx: p.x,
                cy: p.y,
                r: Math.max(8, radius),
                fill: "transparent",
                "pointer-events": "all",
                class: "facet-point-hit",
              },
              g,
            )
          : drawMarker(this.renderer, g, p.x, p.y, {
              symbol: marker.symbol ?? "circle",
              radius,
              fill: point.color ?? marker.fillColor ?? s.color,
              stroke: marker.lineColor ?? "#fff",
              strokeWidth: marker.lineWidth ?? 1,
              width: marker.width,
              height: marker.height,
            });
        this.bindPointInteraction(el, s, point);
        el.addEventListener("click", (e) =>
          this.handlePointEvent("click", s, point, e),
        );
        el.addEventListener("mouseover", (e) =>
          this.handlePointEvent("mouseOver", s, point, e),
        );
        el.addEventListener("mouseout", (e) =>
          this.handlePointEvent("mouseOut", s, point, e),
        );
        labelData.push({ pt: p, p: point });
      });
      const dl = s.options.dataLabels;
      if (dl?.enabled) {
        const total = s.points.reduce((sum, point) => sum + (point.y ?? 0), 0);
        for (const { pt: labelPoint, p: point } of labelData) {
          const text = labelString(dl, {
            x: point.x,
            y: point.y,
            point: point.options,
            series: s.name,
            name: point.name ?? point.x,
            index: point.index,
            color: point.color ?? s.color,
            total,
            percentage: total ? ((point.y ?? 0) / total) * 100 : undefined,
          });
          drawDataLabel(
            this.renderer,
            g,
            text,
            { x: labelPoint.x, y: labelPoint.y - 8 - (dl.distance ?? 0), anchor: "middle" },
            dl,
          );
        }
      }
    }
  }

  // -- Marimekko (mosaic) ------------------------------------------------

  private renderMarimekkoPanel(outer: Rect, visible: BaseSeries[]): void {
    if (!visible.length) return;
    const cats = this.currentCategories(visible) ?? [];
    if (!cats.length) return;
    const bottomReserve = 22,
      plot: Rect = {
        x: outer.x + 8,
        y: outer.y + 6,
        width: outer.width - 16,
        height: outer.height - bottomReserve - 6,
      };

    // Column total across series drives column width; grand total normalises x.
    const colTotal = cats.map((c) =>
      visible.reduce(
        (s, ser) =>
          s + (ser.points.find((p) => String(p.x) === String(c))?.y ?? 0),
        0,
      ),
    );
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
        const el = this.renderer.create(
          "rect",
          {
            x,
            y,
            width: Math.max(1, w),
            height: Math.max(0, h),
            fill: p?.color ?? s.color ?? paletteColor(this.colors, si),
            stroke: "#fff",
            "stroke-width": 1,
            class: "facet-point",
          },
          this.renderer.group(
            { class: `facet-series facet-marimekko ${s.name}` },
            this.renderer.root,
          ),
        );
        if (p) {
          this.bindPointInteraction(el, s, p);
          el.addEventListener("click", (e) =>
            this.handlePointEvent("click", s, p, e),
          );
          el.addEventListener("mouseover", (e) =>
            this.handlePointEvent("mouseOver", s, p, e),
          );
          el.addEventListener("mouseout", (e) =>
            this.handlePointEvent("mouseOut", s, p, e),
          );
        }
        // Percentage label in roomy segments. Supplying dataLabels turns this
        // into the standard configurable label path; enabled:false hides it.
        const dl = s.options.dataLabels;
        if (h > 16 && w > 26 && val > 0 && dl?.enabled !== false) {
          const percentage = (val / colTotal[ci]) * 100;
          if (dl?.enabled) {
            drawDataLabel(
              this.renderer,
              this.renderer.root,
              labelString(dl, {
                x: cat,
                y: val,
                point: p?.options ?? {},
                series: s.name,
                name: p?.name ?? cat,
                index: p?.index,
                color: p?.color ?? s.color,
                total: colTotal[ci],
                percentage,
              }),
              { x: x + w / 2, y: y + h / 2 + 4, anchor: "middle" },
              { ...dl, color: dl.color ?? "#fff", fontWeight: dl.fontWeight ?? "600" },
            );
          } else {
            this.renderer.text(
              `${Math.round(percentage)}%`,
              x + w / 2,
              y + h / 2,
              {
                "text-anchor": "middle",
                "dominant-baseline": "middle",
                ...FONTS.dataLabel,
                fill: "#fff",
                "font-weight": "600",
              },
              this.renderer.root,
            );
          }
        }
        y += h;
      });
      // Category label + width readout.
      this.renderer.text(
        String(cat),
        x + w / 2,
        plot.y + plot.height + 14,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        this.renderer.root,
      );
      x += w + gap;
    });
  }

  /**
   * Collapse each series' points into one aggregated value per unique
   * combination of `dims`. Leaves are ordered so that outer dimensions form
   * contiguous groups, and both the outer groups and each group's inner
   * values are ordered by first appearance in the data (not sorted
   * alphabetically) — see the ordering note below.
   */
  private buildNested(
    visible: BaseSeries[],
    dims: string[],
    agg: "sum" | "avg" | "count" | "min" | "max",
  ): {
    leaves: string[][];
    keys: string[];
    seriesPoints: Map<number, Point[]>;
  } {
    // First-seen order for each dimension value, keyed by the values of the
    // levels above it (its "parent group"). Level 0 has a single implicit
    // parent (the whole dataset), so it's still one global order — but
    // levels below it can order their values differently per parent group,
    // matching the order that group's own data appeared in.
    const orderByPrefix: Array<Map<string, Map<string, number>>> = dims.map(
      () => new Map(),
    );
    const tuples = new Map<string, string[]>();
    for (const s of visible) {
      for (const p of s.points) {
        const tuple = dims.map((d) => String(p.options[d] ?? ""));
        let prefix = "";
        tuple.forEach((v, lvl) => {
          let scoped = orderByPrefix[lvl].get(prefix);
          if (!scoped) {
            scoped = new Map();
            orderByPrefix[lvl].set(prefix, scoped);
          }
          if (!scoped.has(v)) scoped.set(v, scoped.size);
          prefix = prefix + "\u0000" + v;
        });
        tuples.set(tuple.join("\u0000"), tuple);
      }
    }
    const leaves = [...tuples.values()].sort((a, b) => {
      let prefix = "";
      for (let lvl = 0; lvl < dims.length; lvl++) {
        const scoped = orderByPrefix[lvl].get(prefix)!;
        const d = scoped.get(a[lvl])! - scoped.get(b[lvl])!;
        if (d !== 0) return d;
        prefix = prefix + "\u0000" + a[lvl];
      }
      return 0;
    });
    const keys = leaves.map((l) => l.join("\u0000"));
    const keyIndex = new Map(keys.map((k, i) => [k, i]));

    const seriesPoints = new Map<number, Point[]>();
    for (const s of visible) {
      const buckets = new Map<string, number[]>();
      for (const p of s.points) {
        const key = dims.map((d) => String(p.options[d] ?? "")).join("\u0000");
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p.y ?? 0);
      }
      const pts: Point[] = [];
      for (const [key, vals] of buckets) {
        const i = keyIndex.get(key)!;
        pts.push({
          x: key,
          index: i,
          y: this.aggregate(vals, agg),
          name: leaves[i].join(" / "),
          options: { y: this.aggregate(vals, agg) },
        });
      }
      pts.sort((a, b) => a.index - b.index);
      seriesPoints.set(s.index, pts);
    }
    return { leaves, keys, seriesPoints };
  }

  private aggregate(
    vals: number[],
    mode: "sum" | "avg" | "count" | "min" | "max",
  ): number {
    if (!vals.length) return 0;
    switch (mode) {
      case "avg":
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      case "count":
        return vals.length;
      case "min":
        return Math.min(...vals);
      case "max":
        return Math.max(...vals);
      default:
        return vals.reduce((a, b) => a + b, 0);
    }
  }

  private isInverted(visible: BaseSeries[]): boolean {
    if (this.options.chart?.inverted) return true;
    return visible.some((s) => s.type === "bar");
  }

  // -- Scales ------------------------------------------------------------

  private buildScales(
    visible: BaseSeries[],
    plot: Rect,
    inverted: boolean,
    shared?: { x?: BaseSeries[]; y?: BaseSeries[] },
  ): { xScale: Scale; xScale2?: Scale; yScale: Scale; yScale2?: Scale } {
    const xSource = shared?.x ?? visible;
    const ySource = shared?.y ?? visible;
    const primaryXSource = xSource.filter((s) => (s.options.xAxis ?? 0) === 0);
    const secondaryXSource = xSource.filter((s) => (s.options.xAxis ?? 0) === 1);
    const categories = this.currentCategories(
      primaryXSource.length ? primaryXSource : xSource,
      0,
    );
    const xAxisOpts = axisAt(this.options.xAxis, 0);
    const xAxisOpts2 = axisAt(this.options.xAxis, 1);
    const yAxisOpts = axisAt(this.options.yAxis, 0);

    // Secondary y-axis: series bound via `series.yAxis: 1` get their own
    // scale instead of silently sharing the primary one — otherwise a line
    // series scaled very differently from the bars renders flat/invisible.
    // Only supported for the standard (non-inverted) cartesian layout, same
    // as the nested-axis combo path this mirrors.
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const hasSecondary = !inverted && ySource.some(onSecondary);
    const primaryVisible = hasSecondary
      ? ySource.filter((s) => !onSecondary(s))
      : ySource;

    // Value domain across the primary axis's series only (falls back to all
    // visible series when nothing besides the secondary axis is present, so
    // this can't produce an empty domain). Error bars are typically overlaid
    // on (and read like) a column series, so they share its zero baseline.
    let [vMin, vMax] = this.valueDomain(
      primaryVisible.length ? primaryVisible : ySource,
    );
    const includeZero = primaryVisible.some((s) =>
      ["column", "bar", "area", "areaspline", "errorbar", "lollipop"].includes(
        s.type,
      ),
    );
    const primaryValueAxis = yAxisOpts;
    if (
      (includeZero || primaryValueAxis.startOnZero === true) &&
      primaryValueAxis.type !== "log"
    ) {
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
      boxplot: 8,
      candlestick: 8,
      columnrange: 10,
    };
    const bubble = primaryVisible.find((s) => s.type === "bubble");
    const bubbleR = bubble ? (bubble.options.sizeRange?.[1] ?? 34) + 2 : 0;
    const markerR = Math.max(
      bubbleR,
      ...primaryVisible
        .filter(
          (s) =>
            s.type === "scatter" ||
            s.type === "jitter" ||
            s.type === "dumbbell" ||
            s.type === "slope",
        )
        .map((s) => (s.options.marker?.radius ?? 5) + 2),
      ...primaryVisible.map((s) => GEOM_PAD[s.type] ?? 0),
      0,
    );
    if (markerR) {
      const valueAxisOpts = yAxisOpts;
      const valuePx = inverted ? plot.width : plot.height;
      const padY = (markerR / Math.max(1, valuePx)) * (vMax - vMin || 1);
      if (valueAxisOpts.min === undefined) vMin -= padY;
      if (valueAxisOpts.max === undefined) vMax += padY;
    }

    // Data-label headroom: an 'outside'/'top' (or default, for non-stacked)
    // label sits just beyond its bar/point — without extra room, a value
    // that lands on the domain max renders its label flush against (or past)
    // the plot edge, overlapping the title/chrome above it. Skipped when the
    // user set an explicit max (they're opting out of auto-headroom).
    const hasOutsideLabel = primaryVisible.some((s) => {
      const dl = s.options.dataLabels;
      if (!dl?.enabled) return false;
      return (
        dl.position === undefined ||
        dl.position === "outside" ||
        dl.position === "top"
      );
    });
    if (hasOutsideLabel) {
      const valueAxisOpts = yAxisOpts;
      const valuePx = inverted ? plot.width : plot.height;
      const padY = (18 / Math.max(1, valuePx)) * (vMax - vMin || 1);
      if (valueAxisOpts.max === undefined) vMax += padY;
    }

    // Numeric/datetime/log x scales.
    const numericScale = (
      list: BaseSeries[],
      opts: AxisOptions,
      range: [number, number],
      reversed?: boolean,
    ): Scale => {
      const [dmin, dmax] = this.xNumericDomain(list);
      let min = opts.min ?? dmin,
        max = opts.max ?? dmax;
      if (markerR) {
        const padX = (markerR / Math.max(1, plot.width)) * (max - min || 1);
        if (opts.min === undefined) min -= padX;
        if (opts.max === undefined) max += padX;
      }
      if (opts.startOnZero === true && opts.type !== "log") {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
      if (opts.type === "log") {
        return new LogScale({
          domain: [min, max],
          range,
          reversed,
        });
      }
      if (opts.type === "datetime") {
        const { ticks, format } = niceDateTicks(min, max);
        return new LinearScale({
          domain: [min, max],
          range,
          reversed,
          ticks,
          format: (v) => formatDate(v, format),
          nice: opts.min === undefined && opts.max === undefined,
        });
      }
      return new LinearScale({
        domain: [min, max],
        range,
        tickCount: opts.tickCount,
        ...(reversed ? { reversed } : {}),
        nice: opts.min === undefined && opts.max === undefined,
      });
    };

    const horizontalScale = (
      list: BaseSeries[],
      opts: AxisOptions,
      cats: string[] | undefined,
      range: [number, number],
    ) =>
      cats
        ? new CategoryScale({ categories: cats, range, reversed: opts.reversed })
        : numericScale(list, opts, range, opts.reversed);

    if (inverted) {
      // Horizontal bars: value on x (bottom), categories on y (left).
      const xScale = this.valueScale(
        yAxisOpts,
        [vMin, vMax],
        [plot.x, plot.x + plot.width],
      );
      const yScale = categories
        ? new CategoryScale({
            categories,
            range: [plot.y, plot.y + plot.height],
            reversed: xAxisOpts.reversed,
          })
        : numericScale(
            primaryXSource.length ? primaryXSource : xSource,
            xAxisOpts,
            [plot.y, plot.y + plot.height],
            xAxisOpts.reversed,
          );
      return { xScale, yScale };
    }

    const xRange: [number, number] = [plot.x, plot.x + plot.width];
    const primaryX = primaryXSource.length ? primaryXSource : xSource;
    const xScale = horizontalScale(primaryX, xAxisOpts, categories, xRange);
    const xScale2 = secondaryXSource.length
      ? horizontalScale(
          secondaryXSource,
          xAxisOpts2,
          this.currentCategories(secondaryXSource, 1),
          xRange,
        )
      : undefined;
    const yScale = this.valueScale(
      yAxisOpts,
      [vMin, vMax],
      [plot.y + plot.height, plot.y],
    );

    let yScale2: Scale | undefined;
    if (hasSecondary) {
      const secondaryVisible = ySource.filter(onSecondary);
      let [vMin2, vMax2] = this.valueDomain(secondaryVisible);
      const includeZero2 = secondaryVisible.some((s) =>
        [
          "column",
          "bar",
          "area",
          "areaspline",
          "errorbar",
          "lollipop",
        ].includes(s.type),
      );
      const secondaryOpts = axisAt(this.options.yAxis, 1);
      if (
        (includeZero2 || secondaryOpts.startOnZero === true) &&
        secondaryOpts.type !== "log"
      ) {
        vMin2 = Math.min(vMin2, 0);
        vMax2 = Math.max(vMax2, 0);
      }
      yScale2 = this.valueScale(
        axisAt(this.options.yAxis, 1),
        [vMin2, vMax2],
        [plot.y + plot.height, plot.y],
      );
    }
    return { xScale, xScale2, yScale, yScale2 };
  }

  private valueScale(
    opts: AxisOptions,
    domain: [number, number],
    range: [number, number],
  ): Scale {
    const min = opts.min ?? domain[0];
    const max = opts.max ?? domain[1];
    if (opts.type === "log")
      return new LogScale({
        domain: [min, max],
        range,
        reversed: opts.reversed,
      });
    // Fewer ticks on a short/cramped axis — the default of 6 was sized for a
    // full-width chart, not a small card, and produces label clutter there.
    const span = Math.abs(range[1] - range[0]);
    const tickCount = opts.tickCount ?? (span < 100 ? 3 : span < 200 ? 4 : 6);
    return new LinearScale({
      domain: [min, max],
      range,
      tickCount,
      reversed: opts.reversed,
      nice: opts.min === undefined && opts.max === undefined,
    });
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
    for (const s of visible)
      for (const p of s.points) if (typeof p.x === "number") xs.push(p.x);
    return xs.length ? extent(xs) : [0, 1];
  }

  /**
   * Series types that need a banded (categorical) x-axis so bars get a real
   * width. Continuous types (line/area/scatter/bubble/histogram) stay numeric.
   */
  private static readonly BANDED = new Set<ChartType>([
    "column",
    "bar",
    "boxplot",
    "candlestick",
    "waterfall",
    "columnrange",
    "errorbar",
    "bullet",
    "dumbbell",
    "butterfly",
    "lollipop",
  ]);

  private currentCategories(
    visible: BaseSeries[],
    axisIndex = 0,
  ): string[] | undefined {
    const xAxis = axisAt(this.options.xAxis, axisIndex);
    if (xAxis?.categories) return xAxis.categories;
    // A datetime/continuous x-axis stays numeric even for bar-family series.
    const banded =
      xAxis?.type === "category" ||
      (xAxis?.type !== "datetime" &&
        visible.some((s) => FacetViz.BANDED.has(s.type)));
    const allNumeric = visible.every((s) =>
      s.points.every((p) => typeof p.x === "number"),
    );
    // Continuous axis only when nothing needs a band; otherwise fall through and
    // build categories from the (possibly index-based) x values so bars get width.
    if (allNumeric && !banded) return undefined;
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of visible)
      for (const p of s.points) {
        const key = String(p.x);
        if (!seen.has(key)) {
          seen.add(key);
          cats.push(key);
        }
      }
    return cats;
  }

  // -- Stacking & grouping ----------------------------------------------

  private groupInfo(visible: BaseSeries[]): GroupInfo {
    const columnKeys: string[] = [];
    const index = new Map<number, number>();
    for (const s of visible) {
      if (!s.capabilities().grouped) continue;
      const key = s.options.stacking
        ? `stack:${s.options.stack ?? "default"}`
        : `series:${s.index}`;
      let ci = columnKeys.indexOf(key);
      if (ci === -1) {
        ci = columnKeys.length;
        columnKeys.push(key);
      }
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
      registerHover: (el, p) => this.bindPointInteraction(el, s, p),
    };
  }

  private bindPointInteraction(el: SVGElement, s: BaseSeries, p: Point): void {
    // Hover scale/highlight animation — independent of the tooltip.
    this.applyHover(el, s);
    this.bindPointAccessibility(el, s, p);

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
    el.addEventListener("mouseenter", () => {
      this.tooltip!.show(build(), s.options.tooltip);
      this.showCrosshair(s, p);
    });
    el.addEventListener("mousemove", (e) =>
      this.tooltip!.move(e.clientX, e.clientY),
    );
    el.addEventListener("mouseleave", () => {
      this.tooltip!.hide();
      this.hideCrosshair();
    });
    if (
      this.options.accessibility?.enabled !== false &&
      this.options.accessibility?.keyboardNavigation !== false
    ) {
      el.addEventListener("focus", () => {
        this.tooltip!.show(build(), s.options.tooltip);
        const rect = el.getBoundingClientRect();
        this.tooltip!.move(rect.left + rect.width / 2, rect.top + rect.height / 2);
        this.showCrosshair(s, p);
      });
      el.addEventListener("blur", () => {
        this.tooltip!.hide();
        this.hideCrosshair();
      });
    }
  }

  /** Add point semantics plus one-tab-stop, arrow-key navigation. */
  private bindPointAccessibility(
    el: SVGElement,
    s: BaseSeries,
    p: Point,
  ): void {
    const accessibility = this.options.accessibility;
    if (accessibility?.enabled === false) return;

    // Some renderers expose more than one hover target for one logical point
    // (for example both ends of a dumbbell). Keep those pointer targets, but
    // expose only one screen-reader/focus stop for the datum.
    if (
      this.accessiblePoints.some(
        (entry) => entry.series === s && entry.point === p,
      )
    ) {
      el.setAttribute("aria-hidden", "true");
      return;
    }

    this.accessiblePoints.push({ el, series: s, point: p });
    el.classList.add("facet-a11y-point");
    el.setAttribute("role", "img");
    el.setAttribute("aria-roledescription", "data point");
    el.setAttribute("aria-label", this.pointAccessibilityLabel(s, p));

    if (accessibility?.keyboardNavigation === false) return;
    el.setAttribute("tabindex", this.accessiblePoints.length === 1 ? "0" : "-1");
    el.setAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space",
    );

    const activate = () => {
      for (const entry of this.accessiblePoints)
        entry.el.setAttribute("tabindex", entry.el === el ? "0" : "-1");
    };
    el.addEventListener("focus", activate);
    el.addEventListener("pointerdown", activate);
    el.addEventListener("keydown", (event: KeyboardEvent) => {
      const points = this.accessiblePoints.filter((entry) => entry.el.isConnected);
      const current = points.findIndex((entry) => entry.el === el);
      if (current < 0) return;
      let target = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown")
        target = (current + 1) % points.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        target = (current - 1 + points.length) % points.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = points.length - 1;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handlePointEvent("click", s, p, event);
        return;
      } else return;

      event.preventDefault();
      for (const entry of points) entry.el.setAttribute("tabindex", "-1");
      points[target].el.setAttribute("tabindex", "0");
      points[target].el.focus();
    });
  }

  /** Human-readable fallback for standard and specialised point shapes. */
  private pointAccessibilityLabel(s: BaseSeries, p: Point): string {
    const context = {
      seriesName: s.name,
      seriesIndex: s.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      low: p.low,
      high: p.high,
      point: p.options,
    };
    const custom =
      this.options.accessibility?.pointDescriptionFormatter?.(context);
    if (custom) return custom;

    const o = p.options;
    const prefix = `${s.name}, ${p.name ?? p.x}`;
    if (p.box)
      return `${prefix}: minimum ${p.box.min}, lower quartile ${p.box.q1}, median ${p.box.median}, upper quartile ${p.box.q3}, maximum ${p.box.max}`;
    if (p.low !== undefined || p.high !== undefined)
      return `${prefix}: low ${p.low ?? "unknown"}, high ${p.high ?? "unknown"}`;
    if (o.from !== undefined || o.to !== undefined)
      return `${s.name}: ${String(o.from ?? "unknown")} to ${String(o.to ?? "unknown")}, weight ${String(o.weight ?? p.y ?? "unknown")}`;
    if (o.open !== undefined || o.close !== undefined)
      return `${prefix}: open ${String(o.open ?? "unknown")}, high ${String(o.high ?? "unknown")}, low ${String(o.low ?? "unknown")}, close ${String(o.close ?? "unknown")}`;
    if (o.start !== undefined || o.end !== undefined)
      return `${prefix}: start ${String(o.start ?? "unknown")}, end ${String(o.end ?? "unknown")}`;
    if (o.value !== undefined) return `${prefix}: ${String(o.value)}`;
    if (p.y !== undefined) return `${prefix}: ${p.y}`;
    return prefix;
  }

  /** Draw a guide line at the hovered point when `xAxis.crosshair` is on. */
  private showCrosshair(s: BaseSeries, p: Point): void {
    const ctx = this.plotCtx;
    const axisIndex = s.options.xAxis ?? 0;
    const axis = axisAt(this.options.xAxis, axisIndex);
    if (!axis.crosshair || !ctx || ctx.inverted)
      return;
    this.hideCrosshair();
    const scale = axisIndex === 1 ? ctx.xScale2 : ctx.xScale;
    if (!scale) return;
    const x = scale.scale(p.x);
    this.crosshairEl = this.renderer.create(
      "line",
      {
        x1: x,
        y1: ctx.plot.y,
        x2: x,
        y2: ctx.plot.y + ctx.plot.height,
        stroke: this.theme.axis.labelColor,
        "stroke-width": 1,
        "stroke-dasharray": "3 3",
        "pointer-events": "none",
        class: "facet-crosshair",
      },
      this.renderer.root,
    );
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
        series: s.name,
        x: match.name ?? match.x,
        y: match.y ?? match.high,
        low: match.low,
        high: match.high,
        point: match.options,
        color: match.color ?? s.color,
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
    const scale = hover?.scale ?? 0;
    const brightness = hover?.brightness ?? 0.08;
    const style = el.style as CSSStyleDeclaration & { transformBox: string };
    style.transition = "filter 0.12s ease";
    el.addEventListener("mouseenter", () => {
      style.filter = `brightness(${1 + brightness})`;
      if (scale) {
        style.transformBox = "fill-box";
        style.transformOrigin = "center";
        style.transition = "transform 0.12s ease, filter 0.12s ease";
        style.transform = `scale(${scale})`;
      }
    });
    el.addEventListener("mouseleave", () => {
      style.filter = "";
      if (scale) style.transform = "";
    });
  }

  private handlePointEvent(
    kind: "click" | "mouseOver" | "mouseOut",
    s: BaseSeries,
    p: Point,
    dom: Event,
  ): void {
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
    if (kind === "click") {
      se?.click?.(payload);
      this.options.chart?.events?.click?.(payload);
      const ddId = p.options.drilldown;
      if (typeof ddId === "string") this.drillTo(ddId);
    }
    if (kind === "mouseOver") se?.mouseOver?.(payload);
    if (kind === "mouseOut") se?.mouseOut?.(payload);
  }

  /** Replace the series with the matching drilldown series (click-to-expand). */
  private drillTo(id: string): void {
    const dd = this.options.drilldown?.series.find((s) => s.id === id);
    if (!dd) return;
    this.drillStack.push({
      series: this.options.series,
      title: this.options.title,
      xAxis: this.options.xAxis,
    });
    this.options.series = [dd];
    if (dd.name) this.options.title = { text: dd.name };
    // Derive fresh categories from the drilldown data (drop the parent's).
    const xa = axisAt(this.options.xAxis, 0);
    const { categories, ...rest } = xa;
    this.options.xAxis = rest;
    this.build();
    this.animateNext = true;
    this.render();
    this.events.emit("drilldown", { id, series: dd });
  }

  /** Return to the previous level after a drill-down. */
  drillUp(): void {
    const prev = this.drillStack.pop();
    if (!prev) return;
    this.options.series = prev.series;
    this.options.title = prev.title;
    this.options.xAxis = prev.xAxis;
    this.build();
    this.animateNext = true;
    this.render();
    this.events.emit("drillup", {});
  }

  /** Breadcrumb "← Back" control shown while drilled in. */
  private drawDrillUp(outer: Rect): void {
    if (!this.drillStack.length) return;
    const g = this.renderer.group(
      { class: "facet-drillup", style: "cursor:pointer" },
      this.renderer.root,
    );
    const bx = outer.x,
      by = outer.y + 2;
    this.renderer.create(
      "rect",
      {
        x: bx,
        y: by,
        width: 62,
        height: 22,
        rx: 5,
        fill: this.theme.tooltip.backgroundColor,
        stroke: THEME.axis.lineColor,
      },
      g,
    );
    this.renderer.text(
      "← Back",
      bx + 31,
      by + 15,
      {
        "text-anchor": "middle",
        ...FONTS.axisLabel,
        fill: this.theme.axis.labelColor,
      },
      g,
    );
    g.addEventListener("click", () => this.drillUp());
  }

  // -- Legend / visibility ----------------------------------------------

  /** Resolve where the legend sits from its layout/align/verticalAlign options. */
  private legendPlacement(): "top" | "bottom" | "left" | "right" {
    const l = this.options.legend ?? {};
    if (l.layout === "vertical") return l.align === "left" ? "left" : "right";
    return l.verticalAlign === "top" ? "top" : "bottom";
  }

  /** True when the legend represents the points of a single non-cartesian
   *  series (pie / donut / radial bar) rather than one item per series. */
  private isPointLegend(): boolean {
    const first = this.series[0];
    return (
      this.series.length === 1 &&
      !!first &&
      first.capabilities().pointLegend === true
    );
  }

  private buildLegendItems(): Array<LegendItem & { seriesIndex?: number }> {
    const first = this.series[0];
    if (this.series.length === 1 && first?.options.showInLegend === false) {
      return [];
    }
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
    return this.series
      .map((s, seriesIndex) => ({
        label: s.name,
        color: s.color,
        visible: s.visible,
        seriesIndex,
      }))
      .filter(
        (_, seriesIndex) =>
          this.series[seriesIndex].options.showInLegend !== false,
      );
  }

  private toggleSeries(index: number): void {
    const first = this.series[0];
    // Custom legend provider (e.g. multi-level pie groups).
    if (
      this.series.length === 1 &&
      first?.legendItems &&
      first.onLegendToggle &&
      first.legendItems(this.colors)
    ) {
      first.onLegendToggle(index);
      const toggled = first.legendItems(this.colors)?.[index];
      if (toggled) {
        this.options.seriesEvents?.legendItemClick?.({
          series: toggled.label,
          visible: toggled.visible,
        });
      }
      this.render();
      return;
    }
    // Point-legend charts toggle an individual slice/ring; others toggle a series.
    if (this.isPointLegend()) {
      const p = first.points[index];
      if (!p) return;
      if (first.hiddenPoints.has(p.index)) first.hiddenPoints.delete(p.index);
      else first.hiddenPoints.add(p.index);
      this.options.seriesEvents?.legendItemClick?.({
        series: String(p.name ?? p.x),
        visible: !first.hiddenPoints.has(p.index),
      });
      this.render();
      return;
    }
    // Filtered series legends need to retain their original series index.
    const seriesIndex = this.buildLegendItems()[index]?.seriesIndex ?? index;
    const s = this.series[seriesIndex];
    if (!s) return;
    s.visible = !s.visible;
    this.options.seriesEvents?.legendItemClick?.({
      series: s.name,
      visible: s.visible,
    });
    this.render();
  }

  // -- Public API --------------------------------------------------------

  /** Register a chart/point event callback. Returns an unsubscribe fn. */
  on(event: string, listener: (payload: unknown) => void): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Coalesce synchronous mutations into one validation, rebuild, and render.
   * Nested batches are supported. If the callback throws,
   * every mutation made within that batch level is rolled back.
   */
  batchUpdate(callback: (chart: FacetViz) => void): void {
    if (this.destroyed) return;
    const checkpoint: BatchCheckpoint = {
      userOptions: this.userOptions,
      dirty: this.batchDirty,
      preserveSeriesState: this.batchPreserveSeriesState,
      preserveAxisRange: this.batchPreserveAxisRange,
      needsReflow: this.batchNeedsReflow,
      animate: this.batchAnimate,
    };
    this.batchCheckpoints.push(checkpoint);
    this.batchDepth += 1;
    let active = true;
    try {
      const result = (callback as (chart: FacetViz) => unknown)(this);
      if (result && typeof (result as { then?: unknown }).then === "function")
        throw new TypeError("FacetViz.batchUpdate() callback must be synchronous.");
      this.batchDepth -= 1;
      this.batchCheckpoints.pop();
      active = false;
      if (this.batchDepth === 0) this.flushBatch();
    } catch (error) {
      if (active) {
        this.batchDepth -= 1;
        this.batchCheckpoints.pop();
      }
      this.userOptions = checkpoint.userOptions;
      this.batchDirty = checkpoint.dirty;
      this.batchPreserveSeriesState = checkpoint.preserveSeriesState;
      this.batchPreserveAxisRange = checkpoint.preserveAxisRange;
      this.batchNeedsReflow = checkpoint.needsReflow;
      this.batchAnimate = checkpoint.animate;
      throw error;
    }
  }

  /**
   * Merge new options and re-render (rebuilds series when `series` is
   * given). `theme` is re-resolved too — previously it was only read once,
   * in the constructor, so `update({ theme })` silently had no effect.
   */
  update(options: Partial<ChartOptions>): void {
    if (this.destroyed) return;
    const nextOptions = merge(this.userOptions, options as ChartOptions);
    this.commitOptions(nextOptions, {
      preserveSeriesState: options.series === undefined,
      preserveAxisRange: options.xAxis === undefined && options.yAxis === undefined,
      setupReflow: true,
      animate: true,
    });
  }

  /** Replace one series' data in place and re-render (incremental update). */
  setData(seriesIndex: number, data: SeriesOptions["data"]): void {
    if (this.destroyed) return;
    const opts = this.userOptions.series[seriesIndex];
    if (!opts) return;
    const nextOptions = {
      ...this.userOptions,
      series: this.userOptions.series.map((series, index) =>
        index === seriesIndex ? { ...series, data } : series,
      ),
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: true,
      preserveAxisRange: true,
      setupReflow: false,
      animate: true,
    });
  }

  /** Append a point to a series and re-render. */
  addPoint(seriesIndex: number, point: SeriesOptions["data"][number]): void {
    this.appendData(seriesIndex, [point]);
  }

  /**
   * Append multiple raw source points, optionally retaining only a bounded
   * rolling window. Use batchUpdate() to append to several series atomically.
   */
  appendData(
    seriesIndex: number,
    points: readonly SeriesOptions["data"][number][],
    options: AppendDataOptions = {},
  ): void {
    if (this.destroyed || points.length === 0) return;
    const opts = this.userOptions.series[seriesIndex];
    if (!opts) return;
    const maxPoints = options.maxPoints;
    if (
      maxPoints !== undefined &&
      (!Number.isSafeInteger(maxPoints) || maxPoints <= 0)
    )
      throw new RangeError("FacetViz.appendData(): maxPoints must be a positive integer.");
    let data = [...opts.data, ...points];
    if (maxPoints !== undefined && data.length > maxPoints)
      data = data.slice(data.length - maxPoints);
    const nextOptions = {
      ...this.userOptions,
      series: this.userOptions.series.map((series, index) =>
        index === seriesIndex ? { ...series, data } : series,
      ),
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: true,
      preserveAxisRange: true,
      setupReflow: false,
      animate: true,
    });
  }

  setSize(width: number, height: number): void {
    if (this.destroyed) return;
    const nextOptions = {
      ...this.userOptions,
      chart: { ...(this.userOptions.chart ?? {}), width, height },
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: true,
      preserveAxisRange: true,
      setupReflow: true,
      animate: false,
    });
  }

  /**
   * The legend entries this chart will actually draw. Point-legend types
   * (pie/donut/radialbar) are always exactly one series internally, with one
   * entry per slice here — so check `legendItems.length`/`hasLegend` instead
   * of `options.series.length` to decide whether a legend is meaningful.
   */
  get legendItems(): LegendItem[] {
    return this.buildLegendItems();
  }

  /** Whether a legend will actually render (respects `legend.enabled` and needs >1 entry). */
  get hasLegend(): boolean {
    return (
      this.options.legend?.enabled !== false &&
      this.buildLegendItems().length > 1
    );
  }

  /** Serialise the chart to a standalone SVG string. */
  getSVG(): string {
    return serializeSVG(this.renderer, this.width, this.height);
  }

  /** Trigger a download of the chart as an SVG file. */
  downloadSVG(filename = "chart.svg"): void {
    downloadBlob(
      new Blob([this.getSVG()], { type: "image/svg+xml" }),
      filename,
    );
  }

  /** Rasterise to PNG (`scale`× resolution) and download. */
  async downloadPNG(filename = "chart.png", scale = 2): Promise<void> {
    const blob = await this.toPNGBlob(scale);
    if (blob) downloadBlob(blob, filename);
  }

  /** Rasterise the chart to a PNG Blob. */
  toPNGBlob(scale = 2): Promise<Blob | null> {
    return rasterizePNG(
      this.getSVG(),
      this.width,
      this.height,
      this.options.chart?.backgroundColor ?? this.theme.backgroundColor,
      scale,
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.initialReflowFrame !== undefined)
      cancelAnimationFrame(this.initialReflowFrame);
    if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
    this.initialReflowFrame = undefined;
    this.resizeFrame = undefined;
    this.boostHoverCleanups.forEach((cleanup) => cleanup());
    this.boostHoverCleanups = [];
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

interface AxisRange {
  min?: number;
  max?: number;
}

interface CommitBehavior {
  preserveSeriesState: boolean;
  preserveAxisRange: boolean;
  setupReflow: boolean;
  animate: boolean;
}

interface BatchCheckpoint {
  userOptions: ChartOptions;
  dirty: boolean;
  preserveSeriesState: boolean;
  preserveAxisRange: boolean;
  needsReflow: boolean;
  animate: boolean;
}

/** A boosted point's pixel position, for nearest-point hover lookup. */
interface BoostHit {
  x: number;
  y: number;
  point: Point;
  series: BaseSeries;
}
