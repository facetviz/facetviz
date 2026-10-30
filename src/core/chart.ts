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
  CanvasOptions,
  CanvasBandOptions,
  CanvasDividerOptions,
  CanvasObjectEvent,
  CanvasObjectKind,
  AppendDataOptions,
  MarkerOptions,
  DataLabelOptions,
  LabelContext,
} from "./options.js";
import { Renderer } from "./renderer.js";
import { Axis, Rect, minorGridPositions, SUBTITLE_LINE, widestText } from "./axis.js";
import { Tooltip } from "./tooltip.js";
import {
  Legend,
  LegendItem,
  TOP_LEGEND_INSET,
  legendMargin,
} from "./legend.js";
import { EventEmitter } from "./events.js";
import { LinearScale, LogScale, SymLogScale, CategoryScale, Scale, intervalTicks } from "./scale.js";
import { LAYOUT, FONTS } from "./defaults.js";
import {
  merge,
  extent,
  niceDateTicks,
  niceTicks,
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
import { buildCanvasGrid } from "./canvas-grid.js";
import { layoutCanvas, type CanvasLayout, type CanvasPlacedCell, type CanvasFit } from "./canvas-layout.js";
import { HeaderTiers, categoryRotationExtent, tierWidths, SPLIT_TIER_GAP, SPLIT_TIER_PITCH, TIER_HEIGHT } from "./canvas-headers.js";
import { captureSeriesState, restoreSeriesState } from "./series-state.js";
import { enforceConfiguredValidation } from "./validation.js";
import { paletteColor, alpha, shade } from "./colors.js";
import {
  Theme,
  resolveTheme,
  applyTheme,
  chartFontScale,
  chartTextScale,
  THEME,
} from "./theme.js";
import { BaseSeries, SeriesRenderContext } from "../series/base.js";
import { createSeries } from "../series/registry.js";
import {
  dataLabelFontSize,
  dataLabelTextAttrs,
  drawDataLabel,
  labelEnds,
  labelsWanted,
  labelString,
  pointLabelOptions,
} from "../series/data-label.js";

/** Series whose data labels can sit beside their points. */
const SIDE_LABEL_TYPES = new Set(["line", "spline", "step", "area", "areaspline", "scatter", "bubble"]);
import { drawMarker } from "../series/marker.js";
import { renderAnnotations } from "./annotations.js";
import { renderChartTexts, resolveChartTextStyle } from "./chart-text.js";
import type { Point } from "./point.js";

// SVG fragment IDs share the surrounding document's namespace. Keep resource
// IDs unique across chart instances so browsers do not resolve a series or
// text path against an element belonging to a different chart.
let svgResourceId = 0;
// Data labels are hidden when the plot area's shorter side is under this
// many pixels -- measured inside the axes, title and legend, so a wide but
// short chart is judged by the room its marks actually get.
const SMALL_PLOT_DATA_LABEL_THRESHOLD = 100;

// Space below the title/subtitle baseline reserved when the caller doesn't
// set an explicit `margin`, chosen so the reserved height matches
// LAYOUT.titleHeight/subtitleHeight exactly at each text's *default*
// (unscaled) font size -- e.g. title: 18px font -> baseline 20 -> +10 margin
// = the old fixed 30px. Unlike the old fixed constants, using a margin on
// top of the (already font-scale-aware) baseline means the reserved space
// grows with the actual glyph size FacetViz draws at, instead of staying
// frozen at the reference-size value while the title itself scales up on
// large containers -- which is what let a scaled-up title bleed into the
// plot area below it.
const TITLE_DEFAULT_MARGIN = LAYOUT.titleHeight - (18 + 2);
const SUBTITLE_DEFAULT_MARGIN = LAYOUT.subtitleHeight - (13 + 3);

// Breathing room between an auto-spaced positioned text and the plot it was
// moved out of, so the two never read as touching (see `autoSpaceTexts`).
const TEXT_RESERVE_GAP = 8;

// Most of each dimension that `spacing` (text reserves included) may consume
// before it is scaled back, so the plot itself never collapses to nothing.
const MAX_SPACING_SHARE = 0.85;

// Keep automatically-derived value-axis bounds from landing directly on the
// dataset extrema. The subsequent tick "nicening" may expand this further to
// a round value, but this small buffer guarantees breathing room even when an
// extreme is already a round tick.
const VALUE_DOMAIN_PADDING = 0.05;

// Default chrome gaps reach their full, comfortable size on a large chart.
// Below these dimensions they taper with the constrained side so fixed gaps
// do not crowd the data area in dashboard cards and resized panels.
const CHROME_SPACING_REFERENCE_WIDTH = 960;
const CHROME_SPACING_REFERENCE_HEIGHT = 600;
const MIN_CHROME_SPACING_SCALE = 0.35;

/** Reserved outward distance for a visible Cartesian/nested axis label. */
const axisLabelOffset = (options: AxisOptions): number => {
  if (options.labels?.enabled === false) return 0;
  const value = options.labels?.offset;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
};

/**
 * Multiplicative padding equivalent to `px` pixels on a logarithmic axis
 * spanning [lo, hi] over `axisPx` pixels (additive padding could push the
 * bound to zero or below, which a log axis cannot show).
 */
const logPadFactor = (
  px: number,
  axisPx: number,
  lo: number,
  hi: number,
): number => {
  const decades = lo > 0 && hi > lo ? Math.log10(hi / lo) : 1;
  return Math.pow(10, (px / Math.max(1, axisPx)) * decades);
};

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
  /** Set per panel by `gateDataLabels`; read by `seriesContext`. */
  private labelsSuppressed = false;
  /** Series options whose data labels `gateDataLabels` turned off. */
  private suppressedLabels = new Map<SeriesOptions, SeriesOptions["dataLabels"]>();
  private theme: Theme;
  private width: number;
  private height: number;
  private resizeObserver?: ResizeObserver;
  private initialReflowFrame?: number;
  private resizeFrame?: number;
  private destroyed = false;
  /** How much a fixed `canvas.fit` wants the chart to grow, from this render's layouts. */
  private naturalDelta?: { dw: number; dh: number };
  /** Inside the render pass at the canvas's natural size. */
  private fitting = false;
  /** While a fixed `canvas.fit` renders at the canvas's natural size: the
   * size it was given, which text keeps scaling by (a larger canvas
   * scrolls; its text doesn't grow). */
  private fontBasis?: { width: number; height: number };
  /** Axis bands and header levels drawn this render, for resize handles. */
  private resizeBands: ResizeBand[] = [];
  private boostHoverCleanups: Array<() => void> = [];
  /** Play the enter animation on the next render (first render + data updates). */
  private animateNext = true;
  /** Scales + plot captured for drag-zoom. */
  private zoomState?: { plot: Rect; xScale: Scale; yScale: Scale };
  /** Plot + scales of the last cartesian panel (for crosshair). */
  /** The plot area a canvas layout (panes, small multiples) drew in, for
   * titles lined up with the plot (`title.alignTo: 'plot'`). */
  private canvasPlot?: Rect;
  private plotCtx?: {
    plot: Rect;
    xScale: Scale;
    xScale2?: Scale;
    yScale: Scale;
    inverted: boolean;
  };
  private crosshairEl?: SVGElement;
  /** Rendered SVG data marks in keyboard-navigation order. */
  /** The points given a focus stop, per series: a quick check for a second
   * hover target of a point already exposed. */
  private accessibleBySeries = new Map<BaseSeries, Set<Point>>();
  /** Each series' total of y, for tooltips' percentage; worked out once. */
  private seriesTotals = new Map<BaseSeries, number>();
  private accessiblePoints: Array<{
    el: SVGElement;
    series: BaseSeries;
    point: Point;
  }> = [];
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
    // The render replaces every mark, so a mark focused by keyboard would
    // lose focus to the page: give it back to the same mark, found by its label.
    const active = document.activeElement;
    const label = active && active !== this.container && this.container.contains(active) ? active.getAttribute("aria-label") : null;
    this.render();
    if (label) {
      const again = this.container.querySelector<SVGElement | HTMLElement>(`[aria-label="${CSS.escape(label)}"]`);
      again?.focus({ preventScroll: true });
    }
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
   * Hide or restore data labels for one panel, once its plot area is known.
   * Panel renderers call this before building scales, since label headroom
   * feeds into the value domain. With `chart.responsive` (default on) and a
   * plot whose shorter side is under SMALL_PLOT_DATA_LABEL_THRESHOLD, it
   * clears each series' own `dataLabels.enabled` for this render (restored
   * by `applyResponsiveOverrides`' restore) and sets the
   * `suppressDataLabels` flag handed to every series via `seriesContext`,
   * for value labels (heatmap, sunburst, radialbar) that aren't gated by a
   * `dataLabels` option of their own.
   *
   * With `cartesian`, stacked columns and bars whose labels sit inside
   * their segments are left alone: they drop each label that doesn't fit
   * its own segment, so a small plot keeps the labels its big segments
   * have room for.
   */
  private gateDataLabels(
    plot: Rect,
    series: BaseSeries[],
    cartesian = false,
  ): void {
    const suppress =
      this.options.chart?.responsive !== false &&
      Math.min(plot.width, plot.height) < SMALL_PLOT_DATA_LABEL_THRESHOLD;
    this.labelsSuppressed = suppress;
    for (const item of series) {
      // Clones made for a panel (filterByDimensions, withPoints) share their
      // source's options object, so key the stash on it.
      const options = item.options;
      if (suppress && !(cartesian && item.fitsLabelsPerSegment())) {
        if (!labelsWanted(options.dataLabels)) continue;
        if (!this.suppressedLabels.has(options))
          this.suppressedLabels.set(options, options.dataLabels);
        // Points' own labels go too.
        options.dataLabels = { ...options.dataLabels, enabled: false, first: undefined, last: undefined, pointOf: undefined };
      } else if (this.suppressedLabels.has(options)) {
        options.dataLabels = this.suppressedLabels.get(options);
        this.suppressedLabels.delete(options);
      }
    }
  }

  /**
   * Apply `responsive` rules and drop axis lines at the smallest sizes,
   * leaving more room for the series geometry (data labels are gated per
   * panel by `gateDataLabels`). Overrides resolved
   * per-instance state for the duration of this render only and returns a
   * function that restores the originals.
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
      for (const [options, dataLabels] of this.suppressedLabels)
        options.dataLabels = dataLabels;
      this.suppressedLabels.clear();
      this.labelsSuppressed = false;
    };
    if (this.options.chart?.responsive === false) return restore;
    const hideAxisLines = Math.min(this.width, this.height) < 110;
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
    this.naturalDelta = undefined;
    this.resizeBands = [];
    const restoreResponsive = this.applyResponsiveOverrides();
    try {
    this.boostHoverCleanups.forEach((cleanup) => cleanup());
    this.boostHoverCleanups = [];
    this.accessiblePoints = [];
    this.accessibleBySeries = new Map();
    this.seriesTotals = new Map();
    if (!this.renderer) {
      this.renderer = new Renderer(this.width, this.height);
      this.renderer.mount(this.container);
    } else {
      this.renderer.clear();
      this.renderer.setSize(this.width, this.height);
    }

    // Apply the theme (updates shared FONTS + the live THEME read by axes
    // etc.), scaling chrome fonts to this render's size -- `responsive:
    // false` opts out, same flag the data-label/axis-line overrides below
    // already respect. `scaleFonts` (default on) additionally makes that
    // scaling apply to a caller's own explicit font sizes, not just the
    // theme defaults (see theme.ts's FONT_SCALE_STATE); pass `false` to
    // render every font size verbatim regardless of chart size.
    applyTheme(
      this.theme,
      this.options.chart?.responsive === false
        ? 1
        : chartFontScale(this.fontBasis?.width ?? this.width, this.fontBasis?.height ?? this.height),
      this.options.chart?.scaleFonts !== false,
    );

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

    const spacing = this.resolveSpacing();
    let top = spacing[0];
    // Titles at the bottom are drawn as at the top, then moved down, the
    // margin that would follow them put between them and the chart.
    const titles = this.renderer.group({}, this.renderer.root);
    const titleTexts: Array<[SVGTextElement, string | undefined]> = [];
    const titlesUsed = this.renderTitles(top, titles, titleTexts);
    const titlesBottom = this.options.title?.verticalAlign === "bottom";
    if (titlesBottom) {
      const sub = this.options.subtitle;
      const margin = sub?.text && sub.enabled !== false ? (sub.margin ?? SUBTITLE_DEFAULT_MARGIN) : (this.options.title?.margin ?? TITLE_DEFAULT_MARGIN);
      titles.setAttribute("transform", `translate(0, ${this.height - spacing[2] - top - titlesUsed + margin})`);
    } else {
      top += titlesUsed;
    }
    const plotBefore = this.plotCtx;
    this.canvasPlot = undefined;

    // Legend placement: top / bottom (horizontal strip) or left / right
    // (vertical column). Space is reserved on the chosen side.
    const legendItems = this.buildLegendItems();
    const showLegend =
      this.options.legend?.enabled !== false &&
      (legendItems.length > 1 || legendItems.some((item) => item.scale || item.key));
    const legendPlace = this.legendPlacement();
    const legendVertical = legendPlace === "left" || legendPlace === "right";
    let legendReserveH = 0;
    let legendReserveW = 0;
    if (showLegend) {
      const legendOptions = this.options.legend ?? {};
      const legendSpacingScale = this.chromeSpacingScale(legendPlace);
      if (legendVertical) {
        legendReserveW = Legend.verticalWidth(
          legendItems,
          legendOptions,
          legendPlace,
          legendSpacingScale,
        );
      } else {
        const legendWidth = this.width - spacing[1] - spacing[3];
        legendReserveH = Legend.horizontalHeight(
          legendItems,
          legendWidth,
          legendOptions,
          legendPlace,
          legendSpacingScale,
        );
      }
    }

    const outer: Rect = {
      x: spacing[3] + (legendPlace === "left" ? legendReserveW : 0),
      y: top + (legendPlace === "top" ? legendReserveH : 0),
      width: this.width - spacing[1] - spacing[3] - legendReserveW,
      height: this.height - top - spacing[2] - legendReserveH - (titlesBottom ? titlesUsed : 0),
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
    } else if (t && (t.columns || t.rows)) {
      this.renderSmallMultiples(outer, t);
    } else if (this.paneIds().length > 1) {
      const panes = this.paneIds();
      this.renderPanes(outer, vis().filter((s) => s.capabilities().cartesian), panes);
    } else {
      this.renderPanel({ rect: outer, series: this.series });
    }

    // Draw the legend in its reserved area. For `bottom`, anchor to the
    // actual end of the plot/axis content (`outer.bottom`) rather than a
    // fixed offset from the container's bottom edge — otherwise any slack
    // in the axis's own reserve (e.g. a short axis title) shows up as dead
    // space between it and the legend instead of just shrinking the chart.
    if (showLegend) {
      const legendOptions = this.options.legend ?? {};
      const margin = legendMargin(
        legendOptions,
        legendPlace,
        this.chromeSpacingScale(legendPlace),
      );
      let lx = outer.x;
      let ly = outer.y + outer.height + margin;
      let lw = outer.width;
      let lh = legendReserveH;
      if (legendPlace === "top") {
        ly = top + TOP_LEGEND_INSET;
      } else if (legendPlace === "left") {
        lx = spacing[3];
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      } else if (legendPlace === "right") {
        lx = outer.x + outer.width + margin;
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      }
      lx += Number.isFinite(legendOptions.offsetX)
        ? (legendOptions.offsetX ?? 0)
        : 0;
      ly += Number.isFinite(legendOptions.offsetY)
        ? (legendOptions.offsetY ?? 0)
        : 0;
      new Legend({
        renderer: this.renderer,
        items: legendItems,
        options: legendOptions,
        x: lx,
        y: ly,
        width: lw,
        height: lh,
        layout: legendVertical ? "vertical" : "horizontal",
        onToggle: (i) => this.toggleSeries(i),
      }).render(
        this.renderer.group(
          { "data-fv-kind": "legend", "data-fv-id": "legend" },
          this.renderer.root,
        ),
      );
    }

    // Titles lined up with the plot area, once it's known (a chart with
    // no cartesian plot keeps them on the chart).
    const plot = this.plotCtx !== plotBefore ? this.plotCtx?.plot : this.canvasPlot;
    if (this.options.title?.alignTo === "plot" && plot) {
      for (const [el, align] of titleTexts) {
        el.setAttribute("x", String(align === "left" ? plot.x : align === "right" ? plot.x + plot.width : plot.x + plot.width / 2));
      }
    }

    renderChartTexts({
      renderer: this.renderer,
      width: this.width,
      height: this.height,
      texts: this.options.texts ?? [],
      textScale: this.textScale(),
    });

    this.applyAccessibility();
    this.installCanvasEvents();
    this.installResizeHandles();
    this.installZoom(outer);
    this.drawDrillUp(outer);
    if (this.animateNext) this.animateEnter();
    this.animateNext = false;

    this.events.emit("render", this);
    this.options.chart?.events?.render?.(this);
    } finally {
      restoreResponsive();
    }
    this.fitToCanvas();
  }

  /**
   * A fixed `canvas.fit`: render once more at the size the canvas needs
   * (its fixed directions only), and let the SVG keep that size rather than
   * shrinking into its container, so the host can scroll it.
   */
  private fitToCanvas(): void {
    const fit = this.options.canvas?.fit;
    const fixed = !!fit && fit !== "entire";
    this.renderer.root.style.maxWidth = fixed ? "none" : "100%";
    if (!fixed || !this.naturalDelta || this.fitting) return;
    const w = fit === "width" ? this.width : Math.max(1, Math.round(this.width + this.naturalDelta.dw));
    const h = fit === "height" ? this.height : Math.max(1, Math.round(this.height + this.naturalDelta.dh));
    if (Math.abs(w - this.width) < 1 && Math.abs(h - this.height) < 1) return;
    this.fontBasis = { width: this.width, height: this.height };
    this.width = w;
    this.height = h;
    this.fitting = true;
    try {
      this.render();
    } finally {
      this.fitting = false;
      this.fontBasis = undefined;
    }
    this.options.chart?.events?.canvasNaturalSize?.({ width: this.width, height: this.height });
  }

  /** The chart's current size: with a fixed `canvas.fit`, its canvas's natural size. */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
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
    // Under the series, just above the background, so points keep their
    // hover and tooltip; the drag starts from anywhere in the plot (below).
    root.insertBefore(overlay, root.firstChild?.nextSibling ?? null);

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

    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.(".facet-zoom-reset")) return;
      const lx = this.localX(e.clientX),
        ly = this.localY(e.clientY);
      if (
        lx < plot.x ||
        lx > plot.x + plot.width ||
        ly < plot.y ||
        ly > plot.y + plot.height
      )
        return;
      startX = clampX(lx);
      startY = clampY(ly);
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
    };
    // The root outlives a render; drop this listener before the next one.
    root.addEventListener("mousedown", down);
    this.boostHoverCleanups.push(() =>
      root.removeEventListener("mousedown", down),
    );

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

  /**
   * Font-size multiplier for positioned texts, matching the `scaleFonts` /
   * `responsive` opt-outs the chrome scale already honours.
   */
  private textScale(): number {
    const chart = this.options.chart;
    if (chart?.responsive === false || chart?.scaleFonts === false) return 1;
    return chartTextScale(this.width, this.height);
  }

  /** Configured spacing, with text reserves folded in and capped to the chart. */
  private resolveSpacing(): [number, number, number, number] {
    return this.clampSpacing(
      this.spacingWithTextReserves(
        this.options.chart?.spacing ?? [5, 5, 5, 5],
      ),
    );
  }

  /**
   * Spacing is authored in absolute pixels, so a pair tuned on a large card
   * can exceed a small one outright -- once top + bottom is taller than the
   * chart the plot rect goes negative, and series fall out of it and lay
   * themselves out against the full chart instead, as if no spacing had been
   * set at all. Shrink each opposing pair proportionally so the plot always
   * keeps a usable share of the chart, whatever size it renders at.
   */
  private clampSpacing(
    spacing: [number, number, number, number],
  ): [number, number, number, number] {
    const fit = (a: number, b: number, extent: number): [number, number] => {
      const total = a + b;
      const limit = extent * MAX_SPACING_SHARE;
      if (total <= limit || total <= 0) return [a, b];
      const scale = limit / total;
      return [a * scale, b * scale];
    };
    const [top, bottom] = fit(spacing[0], spacing[2], this.height);
    const [right, left] = fit(spacing[1], spacing[3], this.width);
    return [top, right, bottom, left];
  }

   /**
   * `spacing` with each edge-anchored positioned text's own side widened to
   * hold it, when `chart.autoSpaceTexts` is on. Every text is measured through
   * the same style and scale renderChartTexts will draw it with, so the
   * reserve stays correct at any chart size rather than depending on a
   * `spacing` value that was only right at the one size it was tuned at.
   *
   * The reserve *adds to* the configured spacing rather than replacing it, so
   * the two mean different things and neither silently cancels the other:
   * fitting the text is this function's job, while `spacing` is the padding
   * the caller wants on top of that. Replacing instead left `spacing` inert
   * on exactly the sides a text sat on -- a control that quietly did nothing.
   */
  private spacingWithTextReserves(
    spacing: [number, number, number, number],
  ): [number, number, number, number] {
    const texts = this.options.texts ?? [];
    if (this.options.chart?.autoSpaceTexts !== true || !texts.length) {
      return spacing;
    }
    const textScale = this.textScale();
    const reserve: Array<number | null> = [null, null, null, null];
    for (const item of texts) {
      if (!item.text || item.enabled === false) continue;
      const style = resolveChartTextStyle(item, textScale);
      const fontSize = parseFloat(style["font-size"] ?? "11") || 11;
      const lines = item.text.split("\n");
      // Defaulted the same way renderChartTexts positions them, so a text
      // reserves against the edge it is actually drawn at.
      const align = item.align ?? "left";
      const verticalAlign = item.verticalAlign ?? "top";
      // A text pinned to a top or bottom edge takes a band there even when it
      // is also left- or right-aligned: a corner text is a header or footer,
      // and a band costs a fraction of what a side column does. Holding a
      // one-line text at the top-left of a 262x302 card needs either a 42px
      // band or an 89px full-height column -- 21% of the card against 44%.
      // A side column is for texts with no vertical edge to sit against,
      // i.e. vertically centred ones.
      let side: number;
      let extent: number;
      if (verticalAlign === "top" || verticalAlign === "bottom") {
        side = verticalAlign === "top" ? 0 : 2;
        const offsetY = (item.offsetY ?? 0) * textScale;
        const lineHeight =
          item.lineHeight != null ? item.lineHeight * textScale : fontSize * 1.2;
        extent =
          fontSize +
          lineHeight * (lines.length - 1) +
          (verticalAlign === "top" ? offsetY : -offsetY);
      } else if (align === "left" || align === "right") {
        side = align === "left" ? 3 : 1;
        const offsetX = (item.offsetX ?? 0) * textScale;
        extent =
          Math.max(
            ...lines.map(
              (line) => this.renderer.measureText(line, style).width,
            ),
          ) + (align === "left" ? offsetX : -offsetX);
      } else {
        // Centred on both axes: a deliberate overlay, nothing to reserve.
        continue;
      }
      reserve[side] = Math.max(
        reserve[side] ?? 0,
        Math.max(0, extent) + TEXT_RESERVE_GAP,
      );
    }
    return spacing.map(
      (configured, side) => (reserve[side] ?? 0) + configured,
    ) as [number, number, number, number];
  }

  /**
   * An invisible rect over `plot`, first in `layer` so grid lines, series and
   * labels stay on top: what a click on the empty plot lands on.
   */
  private drawPlotArea(layer: SVGGElement, plot: Rect, instance?: string): void {
    const rect = this.renderer.create("rect", {
      x: plot.x,
      y: plot.y,
      width: Math.max(0, plot.width),
      height: Math.max(0, plot.height),
      fill: "transparent",
      class: "facet-plot-area",
      "data-fv-kind": "plotArea",
      "data-fv-id": "plotArea",
      "data-fv-instance": instance,
    });
    layer.insertBefore(rect, layer.firstChild);
  }

  /**
   * Reports clicks, double-clicks and right-clicks on canvas parts (anything
   * carrying `data-fv-kind`) through `chart.events.canvas*`. Points keep
   * their own events: a click on a mark is never a canvas event.
   */
  private installCanvasEvents(): void {
    const events = this.options.chart?.events;
    if (!events?.canvasClick && !events?.canvasDoubleClick && !events?.canvasContextMenu) return;
    const root = this.renderer!.root;
    const target = (e: MouseEvent): Omit<CanvasObjectEvent, "type"> | null => {
      const from = e.target as Element | null;
      if (!from || from.closest(".facet-point, .facet-point-hit, .facet-resize-handle")) return null;
      let el = from.closest("[data-fv-kind]");
      // The drag-zoom overlay lies over the plot area.
      if (!el && from.classList?.contains("facet-zoom-overlay"))
        el = root.querySelector('[data-fv-kind="plotArea"]');
      if (!el) return null;
      // A category axis's label or a legend item: the axis or legend, with
      // the category or item's label as its path.
      const item = from.closest(".facet-axis-label, .facet-legend-item");
      const pathOf = el.hasAttribute("data-fv-path") ? el : item && el.contains(item) ? item : null;
      return {
        kind: el.getAttribute("data-fv-kind") as CanvasObjectKind,
        id: el.getAttribute("data-fv-id") ?? "",
        instance: el.getAttribute("data-fv-instance") ?? undefined,
        ...(pathOf?.hasAttribute("data-fv-path") ? { path: pathOf.getAttribute("data-fv-path")!.split("\u001f") } : {}),
        domEvent: e,
      };
    };
    const on = (
      dom: "click" | "dblclick" | "contextmenu",
      handler: ((ev: CanvasObjectEvent) => void) | undefined,
    ) => {
      if (!handler) return;
      root.addEventListener(dom, (e) => {
        const t = target(e);
        if (!t) return;
        if (dom === "contextmenu") e.preventDefault();
        handler({ type: dom, ...t });
      });
    };
    on("click", events.canvasClick);
    on("dblclick", events.canvasDoubleClick);
    on("contextmenu", events.canvasContextMenu);
  }

  private noteBand(kind: ResizeBand["kind"], id: string, side: ResizeBand["side"], rect: Rect, size: number): void {
    if (size > 0 && rect.width >= 0 && rect.height >= 0) this.resizeBands.push({ kind, id, side, rect, size });
  }

  /**
   * A multi-pane canvas's resizable bands: each side's axis band (across
   * the whole plot area) and each header level (across all its cells).
   */
  private noteCanvasBands(
    layout: CanvasLayout,
    axes: Partial<Record<ResizeBand["side"], AxisOptions>>,
    ids: Record<ResizeBand["side"], string>,
  ): void {
    const p = layout.plotArea;
    const b = layout.axisBands;
    const span = (rects: Rect[]): Rect | undefined => {
      if (!rects.length) return undefined;
      const x = Math.min(...rects.map((r) => r.x));
      const y = Math.min(...rects.map((r) => r.y));
      return {
        x,
        y,
        width: Math.max(...rects.map((r) => r.x + r.width)) - x,
        height: Math.max(...rects.map((r) => r.y + r.height)) - y,
      };
    };
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const opts = axes[side];
      const rect = span(b[side]);
      if (!opts || opts.visible === false || !rect) continue;
      const size = side === "left" || side === "right" ? rect.width : rect.height;
      this.noteBand("axis", opts.id ?? ids[side], side, rect, size);
    }
    // Header levels: across columns their band is a row, down rows a column;
    // which side follows where they sit relative to the plot area.
    const level = (cells: CanvasPlacedCell[], across: boolean) => {
      const rect = span(cells.map((c) => c.rect));
      const field = cells[0]?.field;
      if (!rect || !field) return;
      const side: ResizeBand["side"] = across
        ? (rect.y + rect.height <= p.y + 0.5 ? "top" : "bottom")
        : (rect.x + rect.width <= p.x + 0.5 ? "left" : "right");
      this.noteBand("header", field, side, rect, across ? rect.height : rect.width);
    };
    layout.headers.columns.forEach((cells) => level(cells, true));
    layout.headers.rows.forEach((cells) => level(cells, false));
  }

  /**
   * Resize handles on every noted band's edge facing the panes, when the
   * host listens for `canvasResize`: dragging one draws a guide and reports
   * the band's new size (phase `move`, then `end`).
   */
  private installResizeHandles(): void {
    const onResize = this.options.chart?.events?.canvasResize;
    if (!onResize || !this.resizeBands.length) return;
    const root = this.renderer.root;
    const g = this.renderer.group({ class: "facet-resize-handles" }, root);
    const toSvg = (e: MouseEvent): { x: number; y: number } => {
      const box = root.getBoundingClientRect();
      const kx = box.width ? this.width / box.width : 1;
      const ky = box.height ? this.height / box.height : 1;
      return { x: (e.clientX - box.left) * kx, y: (e.clientY - box.top) * ky };
    };
    for (const band of this.resizeBands) {
      const { rect, side } = band;
      const vertical = side === "left" || side === "right";
      // The edge facing the panes, and which way across it grows the band.
      const edge = side === "left" ? rect.x + rect.width : side === "right" ? rect.x : side === "top" ? rect.y + rect.height : rect.y;
      const grow = side === "left" || side === "top" ? 1 : -1;
      const handle = this.renderer.create("rect", vertical
        ? { x: edge - 3, y: rect.y, width: 6, height: rect.height }
        : { x: rect.x, y: edge - 3, width: rect.width, height: 6 }, g);
      handle.setAttribute("fill", "transparent");
      handle.setAttribute("class", "facet-resize-handle");
      handle.setAttribute("data-fv-resize", `${band.kind}:${band.id}`);
      handle.style.cursor = vertical ? "col-resize" : "row-resize";
      handle.addEventListener("pointerdown", (down) => {
        down.preventDefault();
        down.stopPropagation();
        const start = toSvg(down);
        handle.setPointerCapture?.(down.pointerId);
        let guide: SVGLineElement | undefined;
        const sizeAt = (e: MouseEvent) => {
          const p = toSvg(e);
          const moved = vertical ? p.x - start.x : p.y - start.y;
          return Math.max(0, Math.round(band.size + grow * moved));
        };
        const report = (e: MouseEvent, phase: "move" | "end") => {
          const size = sizeAt(e);
          const at = edge + grow * (size - band.size);
          guide?.remove();
          guide = phase === "move"
            ? this.renderer.create("line", vertical
              ? { x1: at, y1: 0, x2: at, y2: this.height, class: "facet-resize-guide", stroke: THEME.axis.lineColor, "stroke-dasharray": "4 3" }
              : { x1: 0, y1: at, x2: this.width, y2: at, class: "facet-resize-guide", stroke: THEME.axis.lineColor, "stroke-dasharray": "4 3" }, g)
            : undefined;
          onResize({ phase, kind: band.kind, id: band.id, size, side });
        };
        const move = (e: PointerEvent) => report(e, "move");
        const up = (e: PointerEvent) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          report(e, "end");
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
      });
    }
  }

  /** The panes visible cartesian series are in (`series.pane`), in order. */
  private paneIds(): number[] {
    if (this.options.chart?.polar) return [];
    const ids = new Set<number>();
    for (const s of this.series) {
      if (!s.visible || !s.points.length || !s.capabilities().cartesian) continue;
      ids.add(Math.max(0, Math.floor(s.options.pane ?? 0)));
    }
    return [...ids].sort((a, b) => a - b);
  }

  /** `canvas.fit` and `canvas.cell` for {@link layoutCanvas}. */
  private fitBands(): { fit?: CanvasFit; cell?: { width?: number; height?: number } } {
    const c = this.options.canvas;
    return c?.fit && c.fit !== "entire" ? { fit: c.fit, cell: c.cell } : {};
  }

  /**
   * Remembers how much bigger (or smaller) than `area` a laid-out canvas
   * needs to be, for a fixed `canvas.fit` to size the chart after it.
   */
  private noteCanvas(layout: CanvasLayout, area: Rect): void {
    const dw = layout.natural.width - area.width;
    const dh = layout.natural.height - area.height;
    const d = this.naturalDelta;
    this.naturalDelta = d ? { dw: Math.max(d.dw, dw), dh: Math.max(d.dh, dh) } : { dw, dh };
  }

  private renderTitles(top: number, parent: SVGElement, texts: Array<[SVGTextElement, string | undefined]>): number {
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
      texts.push([
        this.renderer.text(
          title.text,
          x,
          top + baseline + (title.offsetY ?? 0),
          {
            "text-anchor": this.anchor(title.align),
            ...style,
            "data-fv-kind": "title",
            "data-fv-id": "title",
          },
          parent,
        ),
        title.align,
      ]);
      used +=
        baseline +
        (title.margin ?? TITLE_DEFAULT_MARGIN) +
        Math.max(0, title.offsetY ?? 0);
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
      // Wrapped to the chart's width, a line at a time.
      const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
      const lines = this.wrapText(sub.text, this.width - spacing[1] - spacing[3], style);
      const lineHeight = fontSize + 4;
      lines.forEach((line, i) =>
        texts.push([
          this.renderer.text(
            line,
            x,
            top + used + baseline + i * lineHeight + (sub.offsetY ?? 0),
            {
              "text-anchor": this.anchor(sub.align),
              ...style,
              "data-fv-kind": "subtitle",
              "data-fv-id": "subtitle",
            },
            parent,
          ),
          sub.align,
        ]),
      );
      used +=
        baseline +
        (lines.length - 1) * lineHeight +
        (sub.margin ?? SUBTITLE_DEFAULT_MARGIN) +
        Math.max(0, sub.offsetY ?? 0);
    }
    return used;
  }

  /** `text` in lines no wider than `width`, broken between words (a word
   * wider than the width stands on its own line). */
  private wrapText(text: string, width: number, style: Record<string, string>): string[] {
    if (width <= 0 || this.renderer.measureText(text, style).width <= width) return [text];
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.renderer.measureText(next, style).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
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
    const measured = widestText(this.renderer, cats.map((category) => label(String(category))), style);
    return opts.labels?.maxWidth
      ? Math.min(measured, opts.labels.maxWidth)
      : measured;
  }

  /** Estimated px width of the widest value-axis label. */
  private valueLabelWidth(visible: BaseSeries[], valOpts: AxisOptions): number {
    return this.numberLabelWidth(this.valueDomain(visible, valOpts), valOpts);
  }

  /** How wide an axis's number labels over `domain` are. */
  private numberLabelWidth([dmin, dmax]: [number, number], valOpts: AxisOptions): number {
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
    if (this.options.chart?.responsive === false) return 0;
    const shortSide = Math.min(this.width, this.height);
    const t = Math.max(0, Math.min(1, (300 - shortSide) / 200));
    return t * maxReduce;
  }

  /** Responsive multiplier for default gaps perpendicular to a chart side. */
  private chromeSpacingScale(
    side: "top" | "bottom" | "left" | "right",
  ): number {
    if (this.options.chart?.responsive === false) return 1;
    const ratio = side === "top" || side === "bottom"
      ? this.height / CHROME_SPACING_REFERENCE_HEIGHT
      : this.width / CHROME_SPACING_REFERENCE_WIDTH;
    return Math.max(MIN_CHROME_SPACING_SCALE, Math.min(1, ratio));
  }

  /** The space kept on a side with no visible axis (`chart.plotPadding`). */
  private plotPadding(side: "top" | "bottom" | "left" | "right"): number | undefined {
    const p = this.options.chart?.plotPadding;
    if (p === undefined) return undefined;
    if (typeof p === "number") return p;
    return p[["top", "right", "bottom", "left"].indexOf(side)];
  }

  private axisReserve(
    opts: AxisOptions,
    side: "top" | "bottom" | "left" | "right",
    labelW: number,
  ): number {
    if (opts.visible === false) return this.plotPadding(side) ?? 6;
    // A set band size wins over measuring.
    if (typeof opts.size === "number") return Math.max(0, opts.size);
    const title = opts.title?.text && opts.title.enabled !== false ? 1 : 0;
    // A subtitle line beyond the title.
    const subtitle = title && opts.title?.subtitle ? SUBTITLE_LINE : 0;
    const titleMargin = opts.title?.margin ??
      (side === "top" || side === "bottom" ? LAYOUT.axisTitleGap : 8) *
        this.chromeSpacingScale(side);
    const titleExtra = title
      ? 10 +
        titleMargin +
        Math.max(0, opts.title?.offset ?? 0) +
        subtitle
      : 0;
    // `14` is the title margin already represented by the fixed baseline
    // reserve. Let the delta be negative too: responsive compaction should
    // return that saved space to the plot, not leave an invisible reserve.
    const horizontalTitleDelta = title
      ? titleMargin - 14 +
        Math.max(0, opts.title?.offset ?? 0) +
        subtitle
      : 0;
    const labelsOn = opts.labels?.enabled !== false;
    const labelOffset = axisLabelOffset(opts);
    if (side === "left" || side === "right") {
      if (!labelsOn) return LAYOUT.tickLength + 6 + titleExtra;
      const floor = title
        ? LAYOUT.defaultLeftAxisWidth - Math.max(0, 8 - titleMargin)
        : LAYOUT.defaultLeftAxisWidth - this.smallChartTaper(14);
      return Math.max(
        floor + labelOffset,
        LAYOUT.tickLength + 8 + labelW + labelOffset + titleExtra,
      );
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
      // With no labels, reserve the title's responsive default margin and
      // its baseline allowance; the label band itself collapses to the tick.
      return title
        ? LAYOUT.tickLength + titleMargin + 10 +
          Math.max(0, opts.title?.offset ?? 0)
        : LAYOUT.tickLength + 6;
    }
    // The title's own placement (see Axis#drawTitle) already reaches past
    // the tick + label band via `tickLength + labelExtent + 14`, which is
    // roughly what `defaultBottomAxisHeight` alone already covers — so this
    // only needs a small top-up for the title's own text height, not that
    // whole distance again (that used to double-count it and leave a big
    // gap below the title before anything else, like a legend, started).
    // With a title, `horizontalTitleDelta` applies the same responsive margin
    // used by Axis#drawTitle so the reserve and rendered position stay aligned.
    const base = title
      ? LAYOUT.defaultBottomAxisHeight
      : LAYOUT.defaultBottomAxisHeight - this.smallChartTaper(10);
    return (
      base +
      (title ? 8 : 0) +
      horizontalTitleDelta +
      rotExtra +
      labelOffset
    );
  }

  private renderPanel(panel: PanelSpec): void {
    const visible = panel.series.filter((s) => s.visible && (s.points.length || s.drawsWithoutPoints()));
    if (!visible.length) return;

    const cartesian = visible.some((s) => s.capabilities().cartesian);
    const inverted = this.isInverted(visible);

    const plot = panel.rect;

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
    // scale on the side opposite the primary axis (the top or bottom when
    // the chart is inverted).
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const renderSecondary = visible.some(onSecondary);
    const valOpts2 = renderSecondary
      ? axisAt(this.options.yAxis, 1)
      : undefined;
    const [farSide, nearSide] = inverted
      ? (["top", "bottom"] as const)
      : (["right", "left"] as const);
    const secondaryYSide =
      valOpts2?.opposite === undefined
        ? valSide === farSide
          ? nearSide
          : farSide
        : valOpts2.opposite
          ? farSide
          : nearSide;
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
    const pad = {
      left: this.plotPadding("left") ?? 8,
      right: this.plotPadding("right") ?? 8,
      top: this.plotPadding("top") ?? 6,
      bottom: this.plotPadding("bottom") ?? 6,
    };
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
    // One pane: the canvas layout places it inside the measured axis bands.
    const single = layoutCanvas(SINGLE_PANE, plot, { axes: pad, ...this.fitBands() });
    this.noteCanvas(single, plot);
    const axisPlot: Rect = single.panes[0].rect;
    const band = (opts: AxisOptions, id: string, side: "left" | "right" | "top" | "bottom") => {
      if (opts.visible !== false) this.noteBand("axis", opts.id ?? id, side, single.axisBands[side][0], pad[side]);
    };
    band(catOpts, "xAxis[0]", catSide);
    band(valOpts, "yAxis[0]", valSide);
    if (renderSecondaryX) band(catOpts2, "xAxis[1]", secondaryXSide);
    if (renderSecondary && valOpts2) band(valOpts2, "yAxis[1]", secondaryYSide);

    this.gateDataLabels(axisPlot, visible, true);
    computeStacks(visible);
    const { xScale, xScale2, yScale, yScale2 } = this.buildScales(
      visible,
      axisPlot,
      inverted,
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
    this.drawPlotArea(axisLayer, axisPlot, panel.instance);
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
      spacingScale: this.chromeSpacingScale(catSide),
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
      id: "xAxis[0]",
      instance: panel.instance,
    });
    catAxis.render(axisLayer);
    let catAxis2: Axis | undefined;
    if (renderSecondaryX && xScale2) {
      catAxis2 = new Axis({
        renderer: this.renderer,
        scale: xScale2,
        position: secondaryXSide,
        spacingScale: this.chromeSpacingScale(secondaryXSide),
        plot: axisPlot,
        options: {
          ...catOpts2,
          opposite: secondaryXSide === "top",
        },
        grid: false,
        id: "xAxis[1]",
        instance: panel.instance,
      });
      catAxis2.render(axisLayer);
    }
    const valAxis = new Axis({
      renderer: this.renderer,
      scale: valScale,
      position: valSide,
      spacingScale: this.chromeSpacingScale(valSide),
      plot: axisPlot,
      cross: catScale,
      options: isSlope ? { ...valOpts, lineWidth: 0 } : valOpts,
      grid: !isSlope,
      id: "yAxis[0]",
      instance: panel.instance,
    });
    valAxis.render(axisLayer);
    let valAxis2: Axis | undefined;
    if (renderSecondary && valOpts2 && yScale2) {
      valAxis2 = new Axis({
        renderer: this.renderer,
        scale: yScale2,
        position: secondaryYSide,
        spacingScale: this.chromeSpacingScale(secondaryYSide),
        plot: axisPlot,
        cross: catScale,
        options: valOpts2,
        grid: false,
        id: "yAxis[1]",
        instance: panel.instance,
      });
      valAxis2.render(axisLayer);
    }

    // Remember the plot + scales for drag-zoom and crosshair (single-panel).
    this.plotCtx = { plot: axisPlot, xScale, xScale2, yScale, inverted };
    this.zoomState = !inverted ? { plot: axisPlot, xScale, yScale } : undefined;

    // Series. High-volume point/line series are drawn to a canvas overlay.
    // A series bound to the secondary axis uses its own scale for both
    // positioning and boost rendering.
    // Inverted, the value scale is the horizontal one, so the secondary
    // value scale stands in for x.
    const yScaleFor = (s: BaseSeries) =>
      !inverted && yScale2 && onSecondary(s) ? yScale2 : yScale;
    const xScaleFor = (s: BaseSeries) =>
      inverted && yScale2 && onSecondary(s)
        ? yScale2
        : xScale2 && onSecondaryX(s)
          ? xScale2
          : xScale;
    const boost = this.boostEnabled(visible, inverted);
    const cctx = boost ? this.createBoostCanvas(axisPlot) : null;
    const hits: BoostHit[] = [];
    renderAnnotations({
      renderer: this.renderer,
      plot: axisPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      xScale2,
      yScale,
      // Inverted, annotations keep to the primary value axis.
      yScale2: inverted ? undefined : yScale2,
      layer: "below",
    });
    const existing = new Set(this.renderer.root.children);
    this.drawSeries(visible, axisPlot, (s) => [xScaleFor(s), yScaleFor(s)], group, inverted, cctx, hits);
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
      // Inverted, annotations keep to the primary value axis.
      yScale2: inverted ? undefined : yScale2,
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

  /** How wide the names at the left of pane rows need to be: the widest
   * (bold) name, up to `PANE_NAME_MAX`. */
  private paneNameWidth(names: string[]): number {
    const font = { ...FONTS.axisLabel, "font-weight": "600" };
    return Math.min(PANE_NAME_MAX, Math.max(...names.map((n) => this.renderer.measureText(n, font).width)) + 12);
  }

  /**
   * Names of measure panes, in place of their axis titles: centred above
   * each pane column (in its top axis band) or at the left of each pane
   * row (the left edge of its left band), cut short to fit. Each reads as
   * its pane's value axis title for clicks.
   */
  private drawPaneNames(
    layout: CanvasLayout,
    names: string[],
    side: "top" | "left",
    axisId: (i: number) => string,
    instances: Array<string | undefined>,
  ): void {
    const g = this.renderer.group({ class: "facet-pane-names" }, this.renderer.root);
    const font = { ...FONTS.axisLabel, "font-weight": "600", fill: THEME.axis.labelColor };
    const bands = side === "top" ? layout.axisBands.top : layout.axisBands.left;
    names.forEach((name, i) => {
      const band = bands[i];
      if (!band) return;
      const room = side === "top" ? band.width - 4 : PANE_NAME_MAX - 8;
      let text = name;
      while (text.length > 1 && this.renderer.measureText(text, font).width > room) text = text.slice(0, -2) + "…";
      const el =
        side === "top"
          ? this.renderer.text(text, band.x + band.width / 2, band.y + band.height - 6, { "text-anchor": "middle", ...font }, g)
          : this.renderer.text(text, band.x + 2, band.y + band.height / 2, { "text-anchor": "start", "dominant-baseline": "middle", ...font }, g);
      if (text !== name) el.appendChild(Object.assign(document.createElementNS("http://www.w3.org/2000/svg", "title"), { textContent: name }));
      el.setAttribute("data-fv-kind", "axisTitle");
      el.setAttribute("data-fv-id", axisId(i));
      const instance = instances[i];
      if (instance) el.setAttribute("data-fv-instance", instance);
    });
  }

  /**
   * Draw series on one plot: those that can on the canvas `cctx` (bars,
   * stacked series, points and lines past the boost threshold), their marks
   * going into `hits` for hover, the rest in SVG. The single plot, every
   * pane of a chart with series in panes and every small-multiple panel
   * draw through here.
   */
  private drawSeries(
    list: BaseSeries[],
    plot: Rect,
    scalesOf: (s: BaseSeries) => [Scale, Scale],
    group: GroupInfo,
    inverted: boolean,
    cctx: CanvasRenderingContext2D | null,
    hits: BoostHit[],
  ): void {
    for (const s of list) {
      const [sx, sy] = scalesOf(s);
      const boostable = !!cctx && this.isBoostable(s, inverted);
      const ownCanvas = boostable && (FacetViz.OWN_CANVAS.has(s.type) || !!s.options.stacking);
      const drawn = ownCanvas
        ? s.renderCanvas(this.seriesContext(s, plot, sx, sy, group, inverted, false), cctx!)
        : null;
      if (drawn) {
        for (const h of drawn) hits.push({ ...h, series: s });
      } else if (boostable && !ownCanvas) {
        this.drawBoostSeries(s, cctx!, sx, sy, hits);
      } else {
        s.render(this.seriesContext(s, plot, sx, sy, group, inverted, false));
      }
    }
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
    const id = `facet-clip-${++svgResourceId}`;
    const cp = document.createElementNS(NS, "clipPath");
    cp.setAttribute("id", id);
    // Explicitly set clipPathUnits to userSpaceOnUse to work around a Chrome
    // bug where the clip path isn't applied correctly when the SVG has a
    // viewBox that differs from the viewport dimensions (responsive scaling).
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const rect = document.createElementNS(NS, "rect");
    // A couple of px of slack so edge markers aren't harshly cut.
    rect.setAttribute("x", String(plot.x - 2));
    rect.setAttribute("y", String(plot.y - 2));
    // A plot squeezed out by its axes clips everything rather than erroring.
    rect.setAttribute("width", String(Math.max(0, plot.width + 4)));
    rect.setAttribute("height", String(Math.max(0, plot.height + 4)));
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
    "column",
    "bar",
  ]);

  /** Series that paint themselves on the canvas (`renderCanvas`): bars
   *  always, and every stacked series (`STACKED_CANVAS`). The rest use
   *  `drawBoostSeries`. */
  private static readonly OWN_CANVAS = new Set(["column", "bar"]);
  private static readonly STACKED_CANVAS = new Set(["column", "bar", "area", "areaspline"]);

  private isBoostable(s: BaseSeries, inverted = false): boolean {
    if (!FacetViz.BOOSTABLE.has(s.type)) return false;
    // Stacked series need a per-point baseline: only those that paint
    // themselves model it. Inverted, only bars know which way they run.
    if (s.options.stacking && !FacetViz.STACKED_CANVAS.has(s.type)) return false;
    if (inverted && !FacetViz.OWN_CANVAS.has(s.type)) return false;
    return true;
  }

  private boostEnabled(visible: BaseSeries[], inverted = false): boolean {
    const b = this.options.chart?.boost;
    if (b === false) return false;
    const enabled = typeof b === "object" ? b.enabled : b;
    if (enabled) return true;
    const threshold = (typeof b === "object" && b.threshold) || 1500;
    // One long series, or many shorter ones adding up (5,000 categories in
    // 12 colors is 60,000 bars though each series has 5,000).
    const boostable = visible.filter((s) => this.isBoostable(s, inverted));
    return (
      boostable.some((s) => s.points.length > threshold) ||
      boostable.reduce((n, s) => n + s.points.length, 0) > threshold * 10
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
      case "line": {
        // Boosted points are never inverted: the value axis runs up and
        // down, so the line runs side to side, with no outline.
        const thin = Math.max(1, r * 0.3);
        c.rect(x - r * 2, y - thin / 2, r * 4, thin);
        c.fillStyle = spec.fill;
        c.fill();
        return;
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
      // A bar is hovered with the pointer in it (the last drawn, on top,
      // wins); other marks by the nearest within 20px.
      for (let i = hits.length - 1; i >= 0; i--) {
        const r = hits[i].rect;
        if (r && mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
          best = hits[i];
          break;
        }
      }
      if (!best) for (const h of hits) {
        if (h.rect) continue;
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
      marker = best.rect
        ? this.renderer.create(
            "rect",
            {
              ...best.rect,
              fill: "none",
              stroke: best.series.color,
              "stroke-width": 2,
              "pointer-events": "none",
            },
            root,
          )
        : this.renderer.create(
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
    const onContextMenu = (e: MouseEvent) => {
      if (active)
        this.handlePointEvent("contextMenu", active.series, active.point, e);
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("click", onClick);
    root.addEventListener("contextmenu", onContextMenu);
    this.boostHoverCleanups.push(() => {
      marker?.remove();
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("click", onClick);
      root.removeEventListener("contextmenu", onContextMenu);
    });
  }

  /**
   * Small multiples on the canvas: the `trellis` rows and columns fields are
   * header levels (`trellis` is this shelf's old spelling) and every row ×
   * column value pair is a pane holding its own copy of the chart, laid out
   * by {@link layoutCanvas}. Value axes run down the left of each pane row
   * (along the bottom of each pane column for horizontal bars), category
   * axes along the bottom row; with `table: false` every pane has both.
   * `sharedY: false` is the value axis's `range.mode: 'independent'`.
   */
  private renderSmallMultiples(outer: Rect, t: TrellisOptions): void {
    const colDim = t.columns;
    const rowDim = t.rows;
    const allVisible = this.series.filter((s) => s.visible && s.points.length);
    if (!allVisible.length) return;
    const categories = this.currentCategories(allVisible);
    const xOpts = firstAxis(this.options.xAxis) ?? {};
    const yOpts0 = axisAt(this.options.yAxis, 0);
    const canvas = this.options.canvas ?? {};
    // Horizontal bars: categories down the left of each pane, values along
    // the bottom, the same swap `renderPanel` applies.
    const inverted = this.isInverted(allVisible);

    // Dual axis: series on `yAxis: 1` read on their own scale down the right
    // (not for horizontal bars).
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const secondaryVisible = allVisible.filter(onSecondary);
    const hasSecondary = !inverted && secondaryVisible.length > 0;
    const primaryVisible = hasSecondary ? allVisible.filter((s) => !onSecondary(s)) : allVisible;
    const yOpts1 = hasSecondary ? axisAt(this.options.yAxis, 1) : undefined;
    const synced = hasSecondary && yOpts1?.sync === true;
    const repeat = t.table === false;
    const independent = yOpts0.range?.mode === "independent" || t.sharedY === false;

    // Series in panes (`series.pane`): each pane a measure leaf, innermost
    // on Rows or Columns (`canvas.paneLayout`; down for vertical charts,
    // across for bars), its own value scale shared across the panels.
    const paneIds = [...new Set(allVisible.map((s) => s.options.pane ?? 0))].sort((a, b) => a - b);
    const measured = paneIds.length > 1;
    const measuresAcross = measured && (canvas.paneLayout ? canvas.paneLayout === "columns" : inverted);
    // Measures across the value axis's direction: each measure pane labels
    // its own value axis, in a wider gap before it.
    const cross = measured && measuresAcross !== inverted;
    const measureItem = { kind: "axis" as const, measures: paneIds.map(String) };
    const paneOf = (p: { rowMeasure?: string; columnMeasure?: string }) => Number(p.rowMeasure ?? p.columnMeasure ?? 0);

    // Points without a value of a split field belong to no pane.
    const records = allVisible
      .flatMap((s) => s.points.map((p) => p.options as Record<string, unknown>))
      .filter((r) => (!rowDim || r[rowDim] != null) && (!colDim || r[colDim] != null));
    const grid = buildCanvasGrid({
      rows: [...(rowDim ? [{ kind: "dim" as const, field: rowDim, ...(t.rowOrder ? { sort: t.rowOrder } : {}) }] : []), ...(measured && !measuresAcross ? [measureItem] : [])],
      columns: [...(colDim ? [{ kind: "dim" as const, field: colDim, ...(t.columnOrder ? { sort: t.columnOrder } : {}) }] : []), ...(measuresAcross ? [measureItem] : [])],
      records,
    });
    const paneSeries = new Map(
      grid.panes.map((p) => {
        const filter: Record<string, unknown> = {};
        if (rowDim) filter[rowDim] = grid.rows.leaves[p.row].values[0];
        if (colDim) filter[colDim] = grid.columns.leaves[p.column].values[0];
        const id = paneOf(p);
        return [
          p.key,
          this.series
            .filter((s) => !measured || (s.options.pane ?? 0) === id)
            .map((s) => s.filterByDimensions(filter))
            .filter((s) => s.visible && s.points.length),
        ];
      }),
    );
    // Stack every pane before reading value ranges, so a stack's summed
    // height is what the axis sees (panes never share points).
    for (const list of paneSeries.values()) computeStacks(list);

    // Value ranges: one for all panes, or one per pane row (column, for bars).
    const zeroTypes = ["column", "bar", "area", "areaspline", "lollipop"];
    const rangeOf = (list: BaseSeries[], opts: AxisOptions): [number, number] => {
      let [lo, hi] = this.valueDomain(list, opts);
      if (!positiveLog(opts) && reachesZero(opts, list.some((s) => zeroTypes.includes(s.type)))) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      return [lo, hi];
    };
    const primaryDomainSeries = primaryVisible.length && !synced ? primaryVisible : allVisible;
    const preserveZeroMin = this.hasNonNegativeZeroBasedSeries(
      primaryDomainSeries,
      this.valueDomain(primaryDomainSeries, yOpts0)[0],
    );
    const shared = rangeOf(primaryDomainSeries, yOpts0);
    // Independent: per pane when every pane has its own axes, else per row.
    const trackRange = new Map<string, [number, number]>();
    const valueRange = (row: number, column: number): [number, number] => {
      if (!independent) return shared;
      const inTrack = (p: { row: number; column: number }) =>
        repeat ? p.row === row && p.column === column : inverted ? p.column === column : p.row === row;
      const track = repeat ? `${row}:${column}` : String(inverted ? column : row);
      let r = trackRange.get(track);
      if (!r) {
        const list = grid.panes
          .filter(inTrack)
          .flatMap((p) => paneSeries.get(p.key) ?? [])
          .filter((s) => synced || !onSecondary(s));
        r = list.length ? rangeOf(list, yOpts0) : shared;
        trackRange.set(track, r);
      }
      return r;
    };
    // A measure pane's value axis: the chart's with the pane's own laid
    // over it, untitled (a header names the measure); one range for the
    // measure across every panel.
    const paneOpts = this.options.panes ?? [];
    const measureAxis = (id: number): AxisOptions => ({ ...yOpts0, ...(paneOpts[id]?.yAxis ?? {}), title: undefined });
    const measureName = (id: number) =>
      paneOpts[id]?.yAxis?.title?.text || [...new Set(allVisible.filter((s) => (s.options.pane ?? 0) === id).map((s) => s.name))].join(", ");
    const measureOfPane = new Map(grid.panes.map((p) => [p.key, paneOf(p)]));
    const measureRanges = new Map<number, [number, number]>();
    const measureRange = (id: number): [number, number] => {
      let r = measureRanges.get(id);
      if (!r) {
        const list = grid.panes.filter((p) => paneOf(p) === id).flatMap((p) => paneSeries.get(p.key) ?? []);
        r = list.length ? rangeOf(list, measureAxis(id)) : shared;
        measureRanges.set(id, r);
      }
      return r;
    };
    const secondaryRange = hasSecondary && yOpts1 ? rangeOf(secondaryVisible, yOpts1) : undefined;
    const secondaryPreservesZeroMin = !!secondaryRange && this.hasNonNegativeZeroBasedSeries(
      secondaryVisible,
      this.valueDomain(secondaryVisible, yOpts1!)[0],
    );

    // Bands. The left axis (values, or categories for bars) keeps its title
    // in every pane row; the bottom axis's title is drawn once, below.
    const leftOpts = inverted ? xOpts : yOpts0;
    const bottomOpts = inverted ? yOpts0 : xOpts;
    const titleRoom = (o: AxisOptions | undefined) =>
      o?.title?.text && o.title.enabled !== false
        ? 18 + Math.max(0, (o.title.margin ?? 8) - 8) + Math.max(0, o.title.offset ?? 0)
        : 0;
    // Measures in rows are named at the left of each row, before its labels.
    const leaves = measuresAcross ? grid.columns.leaves : grid.rows.leaves;
    const measureNames = measured ? leaves.map((l) => measureName(Number(l.measure ?? 0))) : [];
    const nameLeft = measured && !measuresAcross ? this.paneNameWidth(measureNames) : 0;
    const nameTop = measuresAcross ? PANE_NAME_HEIGHT : 0;
    const leftBand = (leftOpts.size ?? LAYOUT.tickLength + 8 + axisLabelOffset(leftOpts) +
      (!inverted
        ? this.valueLabelWidth(primaryVisible, yOpts0)
        : categories
          ? this.catLabelWidth(allVisible)
          // Bars placed at numbers: those numbers up the side.
          : this.numberLabelWidth(this.xNumericDomain(allVisible), xOpts)) + titleRoom(leftOpts)) + nameLeft;
    const rightBand = hasSecondary && yOpts1
      ? yOpts1.size ?? LAYOUT.tickLength + 8 + axisLabelOffset(yOpts1) + this.valueLabelWidth(secondaryVisible, yOpts1) + titleRoom(yOpts1)
      : 0;
    // Room for a second line of labels when some won't fit their slot on
    // one (labels.wrap): the slot as the panes would roughly share the width.
    const wrapRoom = (() => {
      if (inverted || !xOpts.labels?.wrap || !categories?.length) return 0;
      const columnsCount = Math.max(1, grid.columns.leaves.length);
      const slot = (outer.width - leftBand - rightBand) / (columnsCount * categories.length) - 6;
      const font = { ...FONTS.axisLabel, ...sanitizeStyle(xOpts.labels?.style) };
      const tooWide = categories.some((c) => String(c).includes(" ") && this.renderer.measureText(String(c), font).width > slot);
      return tooWide ? Math.round((parseFloat(font["font-size"] ?? "11") || 11) * 1.15) : 0;
    })();
    const bottomBand = bottomOpts.size ?? LAYOUT.defaultBottomAxisHeight + axisLabelOffset(bottomOpts) + wrapRoom;
    const bottomTitle = bottomOpts.title?.text && bottomOpts.title.enabled !== false ? bottomOpts.title : undefined;
    const bottomTitleH = bottomTitle ? 18 + Math.max(0, bottomTitle.offset ?? 0) : 0;

    // Header levels, and a row above them for the split fields' names.
    const headerOn = (f: string | undefined) => !!f && canvas.headers?.[f]?.visible !== false;
    const namesOn = (colDim && canvas.fieldLabels?.columns?.visible !== false) ||
      (rowDim && canvas.fieldLabels?.rows?.visible !== false);
    const nameRowH = namesOn ? 16 : 0;
    // Row headers as wide as their widest (bold) value or the field's name.
    const headerFont = { ...FONTS.axisLabel, ...sanitizeStyle(canvas.headers?.[rowDim ?? ""]?.label?.style) };
    const rowHeaderW = !headerOn(rowDim) ? 0 : canvas.headers?.[rowDim!]?.size ?? Math.max(
      32,
      this.renderer.measureText(rowDim!, FONTS.axisLabel).width + 8,
      ...grid.rows.leaves.map((l) => this.renderer.measureText(String(l.values[0] ?? ""), headerFont).width + 12),
    );
    const colHeaderH = !headerOn(colDim) ? 0 : canvas.headers?.[colDim!]?.size ?? 20;
    const gap = t.gap ?? (repeat ? 16 : 0);
    const area = { x: outer.x, y: outer.y + nameRowH, width: outer.width, height: outer.height - nameRowH - bottomTitleH };
    const layout = layoutCanvas(grid, area, {
      ...this.fitBands(),
      rowHeaders: rowDim ? [rowHeaderW] : [],
      columnHeaders: colDim ? [colHeaderH] : [],
      axes: { left: leftBand, right: rightBand, top: (colDim ? 0 : 6) + nameTop, bottom: bottomBand },
      // Repeated axes sit in the gaps between panes.
      gap: {
        columns: gap + (repeat || (cross && !inverted) ? leftBand + rightBand : 0),
        rows: gap + (repeat || (cross && inverted) ? bottomBand : 0),
      },
    });
    this.canvasPlot = layout.plotArea;
    this.noteCanvas(layout, area);
    this.noteCanvasBands(layout, {
      left: leftOpts,
      right: hasSecondary ? yOpts1 : undefined,
      bottom: bottomOpts,
    }, { left: inverted ? "xAxis[0]" : "yAxis[0]", right: "yAxis[1]", top: "", bottom: inverted ? "yAxis[0]" : "xAxis[0]" });
    const first = layout.panes[0]?.rect;
    if (first) this.gateDataLabels(first, this.series);

    this.drawSmallMultipleHeaders(layout, { colDim, rowDim, outer, area, nameRowH, canvas });
    if (measured) this.drawPaneNames(layout, measureNames, measuresAcross ? "top" : "left", () => yOpts0.id ?? "yAxis[0]", []);

    // With no gap, each pane's top value tick would sit on the divider above.
    const dropLastTick = (sc: Scale, range: [number, number]): Scale => {
      if (repeat || gap > 0 || !(sc instanceof LinearScale)) return sc;
      const ticks = sc.ticks();
      return ticks.length > 1 ? new LinearScale({ domain: sc.domain, range, ticks: ticks.slice(0, -1) }) : sc;
    };
    const lastRow = grid.rows.leaves.length - 1;
    const lastColumn = grid.columns.leaves.length - 1;
    // With several pane rows the left axis's title is drawn by the chart in
    // every row, cut to the row's height: the axis's own would run over
    // into the next row.
    const leftOnce = lastRow > 0;

    // On the canvas past the boost threshold, counting every panel's points
    // together; one hover for all of them.
    const boost = this.boostEnabled([...paneSeries.values()].flat(), inverted);
    const hits: BoostHit[] = [];
    for (const pane of layout.panes) {
      const cell = pane.rect;
      const { row, column } = pane;
      const cellSeries = paneSeries.get(pane.key) ?? [];
      const catRange: [number, number] = inverted ? [cell.y, cell.y + cell.height] : [cell.x, cell.x + cell.width];
      const catScale = categories
        ? new CategoryScale({ categories, range: catRange })
        : this.continuousX(xOpts, this.xNumericDomain(t.sharedX === false && cellSeries.length ? cellSeries : allVisible), catRange, !inverted && lastColumn > 0, inverted, this.xMinGap(allVisible));
      const valRange: [number, number] = inverted ? [cell.x, cell.x + cell.width] : [cell.y + cell.height, cell.y];
      const measureId = measureOfPane.get(pane.key) ?? 0;
      // Short panes still get a few ticks to read values by: about one per
      // 28px of the pane (one more where the top tick is dropped below), or
      // across a bar chart's, one per 70px.
      const paneSpan = inverted ? cell.width : cell.height;
      const ticksFor = (o: AxisOptions): AxisOptions =>
        o.tickCount != null || o.tickInterval != null
          ? o
          : inverted
            // Across a narrow pane, labels need more room than up a short one.
            ? { ...o, tickCount: Math.max(2, Math.min(6, Math.round(paneSpan / 70))) }
            : { ...o, tickCount: Math.max(3, Math.min(6, Math.round(paneSpan / 28))) + (repeat || gap > 0 ? 0 : 1) };
      const valOpts = ticksFor(measured ? measureAxis(measureId) : yOpts0);
      const valScale = dropLastTick(
        this.valueScale(valOpts, measured ? measureRange(measureId) : valueRange(row, column), valRange, true, preserveZeroMin),
        valRange,
      );
      const rightRange: [number, number] = [cell.y + cell.height, cell.y];
      const valScale2 = !hasSecondary || !yOpts1
        ? undefined
        : synced
          ? syncedScale(valScale, rightRange)
          : dropLastTick(this.valueScale(yOpts1, secondaryRange!, rightRange, true, secondaryPreservesZeroMin), rightRange);
      const xScale = inverted ? valScale : catScale;
      const yScale = inverted ? catScale : valScale;

      const axisLayer = this.renderer.group({ class: "facet-axes" }, this.renderer.root);
      this.drawPlotArea(axisLayer, cell, pane.key);
      const leftLabelled = repeat || column === 0;
      const bottomLabelled = repeat || row === lastRow;
      const catLabelled = inverted ? leftLabelled : bottomLabelled;
      const valLabelled = cross || (inverted ? bottomLabelled : leftLabelled);
      // An axis drawn for its grid alone: no labels, line or tick marks
      // (they would sit on the dividers between panes).
      const bare = { labels: { enabled: false }, lineWidth: 0, ticks: false };
      // A bare axis keeps what it draws across the plot: its grid lines
      // (major and minor, between categories too) and plot lines and bands.
      const bareOf = (o: AxisOptions | undefined): AxisOptions => ({
        ...bare,
        gridLineWidth: o?.gridLineWidth,
        gridLineColor: o?.gridLineColor,
        gridLineDashStyle: o?.gridLineDashStyle,
        gridLinePlacement: o?.gridLinePlacement,
        minorTickInterval: o?.minorTickInterval,
        minorGridLineWidth: o?.minorGridLineWidth,
        minorGridLineColor: o?.minorGridLineColor,
        minorGridLineDashStyle: o?.minorGridLineDashStyle,
        plotLines: o?.plotLines,
        plotBands: o?.plotBands,
        zeroLine: o?.zeroLine,
        alternateGridColor: o?.alternateGridColor,
      });

      // Category axis: labelled along the bottom row (down the left column
      // for bars); its grid lines only when asked for.
      const catAxis = new Axis({
        renderer: this.renderer,
        scale: catScale,
        position: inverted ? "left" : "bottom",
        spacingScale: this.chromeSpacingScale(inverted ? "left" : "bottom"),
        plot: cell,
        grid: !!xOpts.gridLineWidth,
        options: catLabelled
          ? { ...xOpts, ticks: false, ...(inverted && !leftOnce ? {} : { title: undefined }) }
          : bareOf(xOpts),
        id: xOpts.id ?? "xAxis[0]",
        instance: pane.key,
      });
      catAxis.render(axisLayer);
      const valAxis = new Axis({
        renderer: this.renderer,
        scale: valScale,
        position: inverted ? "bottom" : "left",
        spacingScale: this.chromeSpacingScale(inverted ? "bottom" : "left"),
        plot: cell,
        grid: true,
        cross: catScale,
        options: valLabelled ? (inverted || leftOnce ? { ...valOpts, title: undefined } : valOpts) : bareOf(valOpts),
        id: yOpts0.id ?? "yAxis[0]",
        instance: pane.key,
      });
      valAxis.render(axisLayer);
      let rightAxis: Axis | undefined;
      if (valScale2 && yOpts1) {
        rightAxis = new Axis({
          renderer: this.renderer,
          scale: valScale2,
          position: "right",
          spacingScale: this.chromeSpacingScale("right"),
          plot: cell,
          grid: false,
          cross: catScale,
          options: repeat || column === lastColumn ? yOpts1 : { ...bareOf(yOpts1), gridLineWidth: 0, minorTickInterval: undefined },
          id: yOpts1.id ?? "yAxis[1]",
          instance: pane.key,
        });
        rightAxis.render(axisLayer);
      }

      if (cellSeries.length) {
        const group = this.groupInfo(cellSeries);
        // Each panel paints on its own canvas, over its own rectangle.
        const cctx = boost ? this.createBoostCanvas(cell) : null;
        this.drawSeries(cellSeries, cell, (s) => [xScale, valScale2 && onSecondary(s) ? valScale2 : yScale], group, inverted, cctx, hits);
      }

      // Plot lines flagged `zIndex: 'above'` paint on top of this pane's series.
      const aboveLayer = this.renderer.group({ class: "facet-axes-above" }, this.renderer.root);
      catAxis.renderAbove(aboveLayer);
      valAxis.renderAbove(aboveLayer);
      rightAxis?.renderAbove(aboveLayer);
    }

    if (hits.length) this.installBoostHover(rectAround(layout.panes.map((p) => p.rect)), hits);

    // The left axis's title in every pane row, centred on it and cut short
    // (the full title on hover) where the row is shorter than the title.
    const leftTitle = leftOpts.title?.text && leftOpts.title.enabled !== false ? leftOpts.title : undefined;
    if (leftOnce && leftTitle?.text) {
      const font = { ...FONTS.axisTitle, ...sanitizeStyle(leftTitle.style) };
      const x = layout.plotArea.x - leftBand + 12 - Math.max(0, leftTitle.offset ?? 0);
      for (const row of layout.rows) {
        const y = row.y + row.height / 2;
        let text: string = leftTitle.text;
        while (text.length > 1 && this.renderer.measureText(text, font).width > row.height - 8) text = text.slice(0, -2) + "…";
        const el = this.renderer.text(text, x, y, { "text-anchor": "middle", transform: `rotate(-90 ${x} ${y})`, ...font }, this.renderer.root);
        if (text !== leftTitle.text) el.appendChild(Object.assign(document.createElementNS("http://www.w3.org/2000/svg", "title"), { textContent: leftTitle.text }));
        el.setAttribute("data-fv-kind", "axisTitle");
        el.setAttribute("data-fv-id", (inverted ? xOpts.id : yOpts0.id) ?? (inverted ? "xAxis[0]" : "yAxis[0]"));
      }
    }

    // The bottom axis's title, once, centred under the panes.
    if (bottomTitle?.text) {
      const p = layout.plotArea;
      const el = this.renderer.text(
        bottomTitle.text,
        p.x + p.width / 2,
        p.y + p.height + bottomBand + 14 + Math.max(0, bottomTitle.offset ?? 0),
        { "text-anchor": "middle", ...FONTS.axisTitle, ...sanitizeStyle(bottomTitle.style) },
        this.renderer.root,
      );
      el.setAttribute("data-fv-kind", "axisTitle");
      el.setAttribute("data-fv-id", (inverted ? yOpts0.id : xOpts.id) ?? (inverted ? "yAxis[0]" : "xAxis[0]"));
    }
  }

  /**
   * The small multiples' header levels (a cell per value, `data-fv-kind`
   * header), the split fields' names above them, banding, and the dividers
   * between pane rows and columns through the headers and the panes.
   */
  private drawSmallMultipleHeaders(
    layout: CanvasLayout,
    o: { colDim?: string; rowDim?: string; outer: Rect; area: Rect; nameRowH: number; canvas: CanvasOptions },
  ): void {
    const { colDim, rowDim, outer, area, nameRowH, canvas } = o;
    const g = this.renderer.group({ class: "facet-trellis-headers" }, this.renderer.root);
    const plot = layout.plotArea;
    const label = { ...FONTS.axisLabel, fill: THEME.axis.labelColor };
    const mark = (el: SVGElement, kind: string, id: string, path?: string) => {
      el.setAttribute("data-fv-kind", kind);
      el.setAttribute("data-fv-id", id);
      if (path !== undefined) el.setAttribute("data-fv-path", path);
    };
    const headerStyle = (f: string) => sanitizeStyle(canvas.headers?.[f]?.label?.style);
    const headerText = (f: string, v: string | null) => {
      const fmt = canvas.headers?.[f]?.label?.format;
      return fmt ? formatString(fmt, { value: v ?? "" }) : String(v ?? "");
    };

    // Banding: every other pane row / column, in the panes and its header.
    const bands = this.renderer.group({ class: "facet-canvas-bands" }, g);
    const band = (opts: CanvasBandOptions | undefined, cells: CanvasPlacedCell[], across: boolean) => {
      if (!opts || (!opts.color && !opts.headerColor)) return;
      const size = Math.max(1, Math.floor(opts.size ?? 1));
      cells.forEach((c, i) => {
        if (i % (2 * size) < size) return;
        const r = c.rect;
        if (opts.color)
          this.renderer.create("rect", across
            ? { x: r.x, y: plot.y, width: r.width, height: Math.max(0, plot.height), fill: opts.color, class: "facet-canvas-band" }
            : { x: plot.x, y: r.y, width: Math.max(0, plot.width), height: r.height, fill: opts.color, class: "facet-canvas-band" }, bands);
        if (opts.headerColor) this.renderer.create("rect", { ...r, fill: opts.headerColor, class: "facet-canvas-band facet-canvas-header-band" }, bands);
      });
    };
    band(canvas.banding?.columns, layout.headers.columns[0] ?? [], true);
    band(canvas.banding?.rows, layout.headers.rows[0] ?? [], false);

    for (const placed of layout.headers.columns[0] ?? []) {
      if (!colDim || placed.rect.height <= 0) break;
      const r = placed.rect;
      const bg = canvas.headers?.[colDim]?.background;
      if (bg) this.renderer.create("rect", { ...r, fill: bg, class: "facet-header-background" }, g);
      const el = this.renderer.text(headerText(colDim, placed.cell.value), r.x + r.width / 2, r.y + r.height / 2 + 4, {
        ...label, "text-anchor": "middle", ...headerStyle(colDim),
      }, g);
      mark(el, "header", colDim, String(placed.cell.value ?? ""));
    }
    for (const placed of layout.headers.rows[0] ?? []) {
      if (!rowDim || placed.rect.width <= 0) break;
      const r = placed.rect;
      const bg = canvas.headers?.[rowDim]?.background;
      if (bg) this.renderer.create("rect", { ...r, fill: bg, class: "facet-header-background" }, g);
      const el = this.renderer.text(headerText(rowDim, placed.cell.value), r.x + 4, r.y + r.height / 2 + 4, {
        ...label, "text-anchor": "start", ...headerStyle(rowDim),
      }, g);
      mark(el, "header", rowDim, String(placed.cell.value ?? ""));
    }
    // The fields' names, bold, above their values (which are regular):
    // the field heads its values, as in a table.
    if (nameRowH) {
      const y = outer.y + 12;
      const name = { ...label, "font-weight": "600", fill: THEME.axis.titleColor };
      if (colDim && canvas.fieldLabels?.columns?.visible !== false)
        mark(this.renderer.text(canvas.fieldLabels?.columns?.text ?? colDim, plot.x + plot.width / 2, y, { ...name, "text-anchor": "middle", ...sanitizeStyle(canvas.fieldLabels?.columns?.style) }, g), "fieldLabel", colDim);
      if (rowDim && canvas.fieldLabels?.rows?.visible !== false)
        mark(this.renderer.text(canvas.fieldLabels?.rows?.text ?? rowDim, area.x + 4, y, { ...name, "text-anchor": "start", ...sanitizeStyle(canvas.fieldLabels?.rows?.style) }, g), "fieldLabel", rowDim);
    }

    // Dividers: the outline of the panes and headers, and a line between
    // neighbouring pane columns / rows (in the middle of any gap).
    const line = (opts: CanvasDividerOptions | undefined, x1: number, y1: number, x2: number, y2: number) => {
      if (opts?.level === "none") return;
      this.renderer.create("line", {
        x1, y1, x2, y2,
        stroke: opts?.color ?? THEME.axis.lineColor,
        "stroke-width": opts?.width ?? 1,
        "stroke-dasharray": opts?.dashStyle,
        class: "facet-trellis-divider",
      }, g);
    };
    const cols = layout.columns;
    const rows = layout.rows;
    const top = colDim ? (layout.headers.columns[0]?.[0]?.rect.y ?? plot.y) : plot.y;
    const left = rowDim ? (layout.headers.rows[0]?.[0]?.rect.x ?? plot.x) : plot.x;
    const right = plot.x + plot.width;
    const bottom = plot.y + plot.height;
    // Lines between columns run on down through the bottom axis's labels,
    // so each column's labels sit in their own column; a line closes the
    // right edge.
    const labelsBottom = Math.max(bottom, ...layout.axisBands.bottom.map((b) => b.y + b.height));
    const colDiv = canvas.dividers?.columns;
    const rowDiv = canvas.dividers?.rows;
    for (let i = 1; i < cols.length; i++) {
      const x = (cols[i - 1].x + cols[i - 1].width + cols[i].x) / 2;
      line(colDiv, x, top, x, labelsBottom);
    }
    for (let i = 1; i < rows.length; i++) {
      const y = (rows[i - 1].y + rows[i - 1].height + rows[i].y) / 2;
      line(rowDiv, left, y, right, y);
    }
    if (colDim) line(colDiv, left, plot.y, right, plot.y);
    if (rowDim) line(rowDiv, plot.x, top, plot.x, labelsBottom);
    if (colDim) line(colDiv, right, top, right, labelsBottom);
  }

  /**
   * Series in several panes (`series.pane`): the panes stacked down (side
   * by side for horizontal bars), each with its own value axis and scale,
   * sharing the category axis, which is labelled along the bottom pane
   * (down the left of the first, for bars). Laid out by {@link layoutCanvas}
   * with each pane a leaf, as measures on a shelf are.
   */
  private renderPanes(outer: Rect, visible: BaseSeries[], paneIds: number[]): void {
    const inverted = this.isInverted(visible);
    const xOpts = firstAxis(this.options.xAxis) ?? {};
    const yOpts0 = axisAt(this.options.yAxis, 0);
    const paneOpts = this.options.panes ?? [];
    const seriesOf = (id: number) => visible.filter((s) => (s.options.pane ?? 0) === id);
    // Each pane's value axis: the chart's, its own laid over it, titled by
    // its series unless a title is set.
    // A pane's name: its own title (panes[i].yAxis.title), else its series'.
    const nameOf = (id: number) => paneOpts[id]?.yAxis?.title?.text || seriesOf(id).map((s) => s.name).join(", ");
    // Panes across the value axis's direction are named by a header (above
    // each column, or at the left of each row) rather than an axis title,
    // leaving the panes more room.
    const layoutOpt = this.options.canvas?.paneLayout;
    const across = layoutOpt ? layoutOpt === "columns" : inverted;
    const cross = across !== inverted;
    const axisOf = (id: number): AxisOptions => {
      const own = paneOpts[id]?.yAxis ?? {};
      const merged: AxisOptions = { ...yOpts0, ...own };
      // Titled by its series only when no title is given at all: an empty
      // one keeps the title hidden.
      if (cross) merged.title = undefined; // a header names the pane
      else if (own.title?.text === undefined && yOpts0.title?.text === undefined) merged.title = { ...yOpts0.title, ...own.title, text: nameOf(id) };
      return merged;
    };
    const categories = this.currentCategories(visible);
    const keys = paneIds.map(String);

    // Panes across (columns) or down (rows): by default along the value
    // axis, sharing the category axis. The other way (`cross`) every pane
    // has its own value axis, in the gap before it, and category labels.
    const grid = buildCanvasGrid({
      [across ? "columns" : "rows"]: [{ kind: "axis" as const, measures: keys }],
      records: [],
    });
    // The value band is as wide (tall, for bars) as the widest pane needs.
    const valueSide = inverted ? "bottom" : "left";
    const catSide = inverted ? "left" : "bottom";
    const valueBand = Math.max(...paneIds.map((id) => this.axisReserve(axisOf(id), valueSide, this.valueLabelWidth(seriesOf(id), axisOf(id)))));
    const catBand = this.axisReserve(xOpts, catSide, this.catLabelWidth(visible));
    const paneGap = this.options.canvas?.paneGap ?? 16;
    const gap = cross ? paneGap + valueBand : paneGap;
    const weights = paneIds.map((id) => paneOpts[id]?.weight ?? 1);
    const names = paneIds.map(nameOf);
    const nameTop = cross && across ? PANE_NAME_HEIGHT : 0;
    const nameLeft = cross && !across ? this.paneNameWidth(names) : 0;
    const layout = layoutCanvas(grid, outer, {
      ...this.fitBands(),
      axes: inverted
        ? { left: catBand + nameLeft, bottom: valueBand, right: 8, top: 6 + nameTop }
        : { left: valueBand + nameLeft, bottom: catBand, right: 8, top: 6 + nameTop },
      gap: across ? { columns: gap } : { rows: gap + nameTop },
      weights: across ? { columns: weights } : { rows: weights },
    });
    this.canvasPlot = layout.plotArea;
    if (cross) this.drawPaneNames(layout, names, across ? "top" : "left", (i) => axisOf(paneIds[i]).id ?? "yAxis[0]", paneIds.map((id) => `pane:${id}`));
    this.noteCanvas(layout, outer);
    this.noteCanvasBands(
      layout,
      inverted ? { left: xOpts, bottom: yOpts0 } : { left: yOpts0, bottom: xOpts },
      { left: inverted ? "xAxis[0]" : "yAxis[0]", right: "", top: "", bottom: inverted ? "yAxis[0]" : "xAxis[0]" },
    );
    if (layout.panes[0]) this.gateDataLabels(layout.panes[0].rect, visible, true);

    const zeroTypes = ["column", "bar", "area", "areaspline", "errorbar", "lollipop"];
    // Every pane's points count together toward the canvas; one hover.
    const boost = this.boostEnabled(visible, inverted);
    const hits: BoostHit[] = [];
    layout.panes.forEach((pane, i) => {
      const id = paneIds[i];
      const list = seriesOf(id);
      const opts = axisOf(id);
      const r = pane.rect;
      computeStacks(list);
      const catRange: [number, number] = inverted ? [r.y, r.y + r.height] : [r.x, r.x + r.width];
      const catScale: Scale = categories
        ? new CategoryScale({ categories, range: catRange, reversed: xOpts.reversed })
        : this.continuousX(xOpts, this.xNumericDomain(visible), catRange, false, inverted, this.xMinGap(visible));
      let [lo, hi] = this.valueDomain(list, opts);
      const preserveZeroMin = this.hasNonNegativeZeroBasedSeries(list, lo);
      if (!positiveLog(opts) && reachesZero(opts, list.some((s) => zeroTypes.includes(s.type)))) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      const valRange: [number, number] = inverted ? [r.x, r.x + r.width] : [r.y + r.height, r.y];
      const valScale = this.valueScale(opts, [lo, hi], valRange, true, preserveZeroMin);

      const axisLayer = this.renderer.group({ class: "facet-axes" }, this.renderer.root);
      const instance = `pane:${id}`;
      this.drawPlotArea(axisLayer, r, instance);
      // The category axis is labelled once (along the last pane, down the
      // first for bars), or on every pane when they split it.
      const catLabelled = cross || (inverted ? i === 0 : i === layout.panes.length - 1);
      const catAxis = new Axis({
        renderer: this.renderer,
        scale: catScale,
        position: catSide,
        spacingScale: this.chromeSpacingScale(catSide),
        plot: r,
        grid: !!xOpts.gridLineWidth,
        options: catLabelled ? xOpts : { labels: { enabled: false }, ticks: false, title: undefined, lineColor: xOpts.lineColor, lineWidth: xOpts.lineWidth },
        id: xOpts.id ?? "xAxis[0]",
        instance,
      });
      catAxis.render(axisLayer);
      const valAxis = new Axis({
        renderer: this.renderer,
        scale: valScale,
        position: valueSide,
        spacingScale: this.chromeSpacingScale(valueSide),
        plot: r,
        grid: true,
        cross: catScale,
        options: opts,
        id: opts.id ?? "yAxis[0]",
        instance,
      });
      valAxis.render(axisLayer);

      // Every series in the pane reads on its scale (no second axis here),
      // on the pane's own canvas past the boost threshold.
      const existing = new Set(this.renderer.root.children);
      const group = this.groupInfo(list);
      const cctx = boost ? this.createBoostCanvas(r) : null;
      this.drawSeries(list, r, () => (inverted ? [valScale, catScale] : [catScale, valScale]), group, inverted, cctx, hits);
      this.clipToPlot(r, existing);
      const aboveLayer = this.renderer.group({ class: "facet-axes-above" }, this.renderer.root);
      catAxis.renderAbove(aboveLayer);
      valAxis.renderAbove(aboveLayer);
    });
    if (hits.length) this.installBoostHover(rectAround(layout.panes.map((p) => p.rect)), hits);
  }

  private renderPolarPanel(plot: Rect, visible: BaseSeries[]): void {
    // Pie/radial: no shared scales; dummy scales satisfy the interface.
    const dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    const inverted = this.isInverted(visible);
    this.gateDataLabels(plot, visible);
    computeStacks(visible);

    const stackedRadialBars = visible.filter(
      (item) => item.type === "radialbar" && !!item.options.stacking,
    );
    const radialCategories: Array<number | string> = [];
    const seenRadialCategories = new Set<string>();
    for (const item of stackedRadialBars) {
      for (const point of item.points) {
        const key = `${typeof point.x}:${String(point.x)}`;
        if (seenRadialCategories.has(key)) continue;
        seenRadialCategories.add(key);
        radialCategories.push(point.x);
      }
    }
    const radialValueMax = Math.max(
      1,
      ...stackedRadialBars.flatMap((item) =>
        item.points.map((point) => point.stackHigh ?? point.y ?? 0),
      ),
    );
    const radialSeriesIndex = new Map(
      stackedRadialBars.map((item, index) => [item.index, index]),
    );

    for (const s of visible) {
      const ctx = this.seriesContext(
        s,
        plot,
        dummy,
        dummy,
        { count: 1, index: new Map() },
        inverted,
        true,
      );
      if (s.type === "radialbar" && s.options.stacking) {
        ctx.radialCategories = radialCategories;
        ctx.radialValueMax = radialValueMax;
        ctx.radialSeriesIndex = radialSeriesIndex.get(s.index) ?? 0;
      }
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
      "dumbbell",
    ]);
    const series = visible.filter((item) => supported.has(item.type));
    if (!series.length) return;
    const inverted = this.options.chart?.inverted === true;
    this.gateDataLabels(plot, series);
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
    const circularTitlePadding =
      inverted &&
      yOptions.title?.text &&
      yOptions.title.enabled !== false
        ? 16
        : 0;
    const radius = Math.max(
      1,
      Math.min(plot.width, plot.height) / 2 -
        Math.min(framePadding + circularTitlePadding, 70),
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
          range: inverted
            ? [innerRadius, radius]
            : [
                -Math.PI / 2 - categoryOffset,
                Math.PI * 1.5 - categoryOffset,
              ],
          padding: 0.12,
          reversed: xOptions.reversed,
        })
      : this.valueScale(
          xOptions,
          this.xNumericDomain(series),
          inverted
            ? [innerRadius, radius]
            : [-Math.PI / 2, Math.PI * 1.5],
          false,
        );

    const onSecondary = (item: BaseSeries) => (item.options.yAxis ?? 0) === 1;
    const primary = series.filter((item) => !onSecondary(item));
    const secondary = series.filter(onSecondary);
    const polarValueScale = (items: BaseSeries[], options: AxisOptions) => {
      const domainSeries = items.length ? items : series;
      let domain = this.valueDomain(domainSeries, options);
      const preserveZeroMin = this.hasNonNegativeZeroBasedSeries(
        domainSeries,
        domain[0],
      );
      if (
        reachesZero(options, domainSeries.some((item) =>
          ["column", "area", "areaspline"].includes(item.type),
        )) &&
        !positiveLog(options)
      )
        domain = [Math.min(0, domain[0]), Math.max(0, domain[1])];
      return this.valueScale(
        options,
        domain,
        inverted
          ? [-Math.PI / 2, Math.PI * 1.5]
          : [innerRadius, radius],
        true,
        preserveZeroMin,
      );
    };
    const yScale = polarValueScale(primary, yOptions);
    const yScale2 = secondary.length
      ? polarValueScale(secondary, axisAt(this.options.yAxis, 1))
      : undefined;

    const project = (angle: number, radial: number) => ({
      x: center.x + Math.cos(angle) * radial,
      y: center.y + Math.sin(angle) * radial,
    });
    const xTicks = xScale.ticks();
    const yTicks = yScale.ticks();
    const annotationProject = inverted
      ? (radial: number, angle: number) => project(angle, radial)
      : project;
    const holeColor =
      this.options.chart?.polarInnerBackgroundColor ??
      this.options.chart?.backgroundColor ??
      this.theme.backgroundColor;
    const drawInvertedRadialLabels = (parent: SVGElement) => {
      if (
        !inverted ||
        xOptions.visible === false ||
        xOptions.labels?.enabled === false
      )
        return;
      for (const tick of xTicks) {
        const radial = xScale.scale(tick);
        if (radial < 0 || radial > radius + 0.5) continue;
        const label = project(-Math.PI / 2, radial);
        this.renderer.text(
          xScale.tickLabel(tick),
          label.x + (xOptions.labels?.offset ?? 6),
          label.y + 4,
          {
            ...labelStyle,
            fill: THEME.axis.labelColor,
            stroke: holeColor,
            "stroke-width": 3,
            "stroke-linejoin": "round",
            "paint-order": "stroke",
            "text-anchor": "start",
            class:
              "facet-polar-category-label facet-polar-radial-x-label",
          },
          parent,
        );
      }
    };
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
          const pathId = `facet-polar-label-path-${++svgResourceId}`;
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
    const drawMinorRings = (
      scale: Scale,
      options: AxisOptions,
      className: string,
    ) => {
      if (
        options.minorTickInterval === undefined ||
        (options.minorGridLineWidth ?? 1) <= 0
      )
        return;
      for (const radial of minorGridPositions(scale, options.minorTickInterval)) {
        if (radial < 0 || radial > radius + 0.5) continue;
        this.renderer.create(
          "circle",
          {
            cx: center.x,
            cy: center.y,
            r: radial,
            fill: "none",
            stroke:
              options.minorGridLineColor ??
              options.gridLineColor ??
              THEME.axis.gridLineColor,
            "stroke-width": options.minorGridLineWidth ?? 1,
            "stroke-dasharray": options.minorGridLineDashStyle ?? "2 2",
            class: `facet-minor-gridline ${className}`,
          },
          axes,
        );
      }
    };
    const drawMinorSpokes = (
      scale: Scale,
      options: AxisOptions,
      className: string,
    ) => {
      if (
        options.minorTickInterval === undefined ||
        (options.minorGridLineWidth ?? 1) <= 0
      )
        return;
      for (const angle of minorGridPositions(scale, options.minorTickInterval)) {
        const innerEdge = project(angle, innerRadius);
        const edge = project(angle, radius);
        this.renderer.create(
          "line",
          {
            x1: innerEdge.x,
            y1: innerEdge.y,
            x2: edge.x,
            y2: edge.y,
            stroke:
              options.minorGridLineColor ??
              options.gridLineColor ??
              THEME.axis.gridLineColor,
            "stroke-width": options.minorGridLineWidth ?? 1,
            "stroke-dasharray": options.minorGridLineDashStyle ?? "2 2",
            class: `facet-minor-gridline ${className}`,
          },
          axes,
        );
      }
    };
    if (inverted) {
      if (xOptions.visible !== false) {
        const axisStart = project(-Math.PI / 2, innerRadius);
        const axisEnd = project(-Math.PI / 2, radius);
        this.renderer.create(
          "line",
          {
            x1: axisStart.x,
            y1: axisStart.y,
            x2: axisEnd.x,
            y2: axisEnd.y,
            stroke: xOptions.lineColor ?? THEME.axis.lineColor,
            "stroke-width": xOptions.lineWidth ?? 1,
            class: "facet-polar-radial-x-axis",
          },
          axes,
        );
        drawMinorRings(xScale, xOptions, "facet-polar-minor-x-ring");
        for (const tick of xTicks) {
          const radial = xScale.scale(tick);
          if (radial < 0 || radial > radius + 0.5) continue;
          this.renderer.create(
            "circle",
            {
              cx: center.x,
              cy: center.y,
              r: radial,
              fill: "none",
              stroke:
                xOptions.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": xOptions.gridLineWidth ?? 1,
              "stroke-dasharray": xOptions.gridLineDashStyle,
              class: "facet-gridline facet-polar-ring facet-polar-x-ring",
            },
            axes,
          );
        }
      }
      if (yOptions.visible !== false) {
        this.renderer.create(
          "circle",
          {
            cx: center.x,
            cy: center.y,
            r: radius,
            fill: "none",
            stroke: yOptions.lineColor ?? THEME.axis.lineColor,
            "stroke-width": yOptions.lineWidth ?? 1,
            class: "facet-polar-y-axis-circle",
          },
          axes,
        );
        drawMinorSpokes(
          yScale,
          yOptions,
          "facet-polar-minor-angular-y-spoke",
        );
        const seenAngles = new Set<number>();
        for (const tick of yTicks) {
          const angle = yScale.scale(tick);
          const normalized =
            Math.round(
              ((((angle + Math.PI / 2) % (Math.PI * 2)) +
                Math.PI * 2) %
                (Math.PI * 2)) *
                1e6,
            ) / 1e6;
          if (seenAngles.has(normalized)) continue;
          seenAngles.add(normalized);
          const innerEdge = project(angle, innerRadius);
          const edge = project(angle, radius);
          this.renderer.create(
            "line",
            {
              x1: innerEdge.x,
              y1: innerEdge.y,
              x2: edge.x,
              y2: edge.y,
              stroke: gridColor,
              "stroke-width": yOptions.gridLineWidth ?? 1,
              "stroke-dasharray": yOptions.gridLineDashStyle,
              class:
                "facet-gridline facet-polar-spoke facet-polar-angular-y-spoke",
            },
            axes,
          );
          if (yOptions.labels?.enabled !== false) {
            const label = project(
              angle,
              radius + (yOptions.labels?.offset ?? 10),
            );
            const cosine = Math.cos(angle);
            this.renderer.text(
              yScale.tickLabel(tick),
              label.x,
              label.y,
              {
                ...FONTS.axisLabel,
                ...sanitizeStyle(yOptions.labels?.style),
                fill: THEME.axis.labelColor,
                "text-anchor":
                  cosine < -0.15
                    ? "end"
                    : cosine > 0.15
                      ? "start"
                      : "middle",
                "dominant-baseline": "middle",
                class: "facet-polar-value-label facet-polar-angular-y-label",
              },
              axes,
            );
          }
        }
      }
    } else {
      if (yOptions.visible !== false) {
        drawMinorRings(yScale, yOptions, "facet-polar-minor-ring");
        for (const tick of yTicks) {
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
              "stroke-dasharray": yOptions.gridLineDashStyle,
              class: "facet-gridline facet-polar-ring",
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
        if (!categories?.length)
          drawMinorSpokes(xScale, xOptions, "facet-polar-minor-spoke");
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
              stroke:
                xOptions.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": xOptions.gridLineWidth ?? 1,
              "stroke-dasharray": xOptions.gridLineDashStyle,
              class: sectorMode
                ? "facet-gridline facet-polar-sector-line"
                : "facet-gridline facet-polar-spoke",
            },
            axes,
          );
        }
        drawCategoryLabels(axes);
      }
    }
    if (xOptions.title?.text && xOptions.title.enabled !== false) {
      const centered = !inverted && xOptions.title.position === "center";
      const align = xOptions.title.align ?? "center";
      const along = align === "start" ? 0.2 : align === "end" ? 0.8 : 0.5;
      const titleX = inverted
        ? plot.x +
          (xOptions.title.margin ?? 8) +
          (xOptions.title.offset ?? 0) +
          6
        : center.x;
      const titleY = inverted
        ? plot.y + plot.height * along
        : centered
          ? center.y
          : plot.y + plot.height - (xOptions.title.offset ?? 0);
      this.renderer.text(
        xOptions.title.text,
        titleX,
        titleY,
        {
          ...FONTS.axisTitle,
          ...sanitizeStyle(xOptions.title.style),
          "text-anchor":
            inverted && align !== "center"
              ? align === "start"
                ? "start"
                : "end"
              : "middle",
          "dominant-baseline": centered ? "middle" : undefined,
          transform: inverted
            ? `rotate(-90 ${titleX} ${titleY})`
            : undefined,
          class: "facet-polar-axis-title facet-polar-x-title",
        },
        axes,
      );
    }
    if (yOptions.title?.text && yOptions.title.enabled !== false)
      {
        const align = yOptions.title.align ?? "center";
        const along = align === "start" ? 0.2 : align === "end" ? 0.8 : 0.5;
        const x = inverted
          ? plot.x + plot.width * along
          : plot.x +
            (yOptions.title.margin ?? 8) +
            (yOptions.title.offset ?? 0) +
            6;
        const y = inverted
          ? center.y + radius + 12 - (yOptions.title.offset ?? 0)
          : plot.y + plot.height * along;
        this.renderer.text(
          yOptions.title.text,
          x,
          y,
          {
            ...FONTS.axisTitle,
            ...sanitizeStyle(yOptions.title.style),
            "text-anchor":
              align === "start" ? "start" : align === "end" ? "end" : "middle",
            transform: inverted ? undefined : `rotate(-90 ${x} ${y})`,
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
      project: annotationProject,
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
          inverted,
          true,
        ),
      );
    }
    if (inverted) {
      const labelOverlay = this.renderer.group(
        { class: "facet-polar-axis-label-overlay" },
        this.renderer.root,
      );
      drawInvertedRadialLabels(labelOverlay);
    }
    renderAnnotations({
      renderer: this.renderer,
      plot: polarPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      yScale,
      yScale2,
      layer: "above",
      project: annotationProject,
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

  /**
   * The nested x axis as a canvas: the outer `dimensions` are header levels
   * and the innermost is a category axis inside each pane, one pane per
   * outer group (`xAxis.dimensions` is this shelf's old spelling). Header
   * levels sit below the panes, or above them with `opposite` (categories
   * stay below); down the left (and right) for horizontal bars.
   */
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
    // Stacks are of the leaf points, built after the series' own were.
    computeStacks(aggSeries);

    // Horizontal bars: categories and header levels run down the left (the
    // value axis along the bottom, a secondary one across the top).
    const inverted = this.isInverted(visible);

    const yOpts0 = axisAt(this.options.yAxis, 0);
    const yOpts1 = axisAt(this.options.yAxis, 1);
    const onAxis = (s: BaseSeries, i: number) => (s.options.yAxis ?? 0) === i;
    const secondary = aggSeries.filter((s) => onAxis(s, 1));
    const hasSecondary = secondary.length > 0;

    const xOpts = firstAxis(this.options.xAxis) ?? {};
    const canvas = this.options.canvas ?? {};
    const split = !!xOpts.opposite;
    // Hidden, the axis draws nothing and keeps only a 6px sliver, as a
    // plain hidden axis does.
    const catVisible = xOpts.visible !== false;
    const levels = dims.length;
    const catLabelOffset = catVisible ? axisLabelOffset(xOpts) : 0;
    const titleOn = !!(xOpts.title?.text && xOpts.title.enabled !== false);
    const header = (l: number) => canvas.headers?.[dims[l]];
    const shown = (l: number) => catVisible && header(l)?.visible !== false;

    const grid = buildCanvasGrid({
      [inverted ? "rows" : "columns"]: [
        ...dims.slice(0, -1).map((field) => ({ kind: "dim" as const, field })),
        { kind: "category" as const, field: dims[levels - 1] },
      ],
      records: leaves.map((l) => Object.fromEntries(dims.map((d, i) => [d, l[i]]))),
    });

    let layout: CanvasLayout;
    if (!inverted) {
      const leftSpacingScale = this.chromeSpacingScale("left");
      const rightSpacingScale = this.chromeSpacingScale("right");
      const valueBand = (opts: AxisOptions, list: BaseSeries[], scale: number) =>
        typeof opts.size === "number" ? opts.size : LAYOUT.tickLength + 8 + axisLabelOffset(opts) + this.valueLabelWidth(list, opts) +
        (opts.title?.text && opts.title.enabled !== false
          ? 18 + ((opts.title.margin ?? 8 * scale) - 8) + Math.max(0, opts.title.offset ?? 0)
          : 0);
      const rotExtra = categoryRotationExtent(leaves, xOpts.labels?.rotation ?? 0);
      const sepExtra = split ? Math.max(0, levels - 2) * SPLIT_TIER_GAP : 0;
      const titleBand = catVisible
        ? 12 + sepExtra + (titleOn
          ? 30 + ((xOpts.title!.margin ?? LAYOUT.axisTitleGap * this.chromeSpacingScale("bottom")) - LAYOUT.axisTitleGap) +
            Math.max(0, xOpts.title!.offset ?? 0)
          : 0)
        : 0;
      const topExtra = catVisible && split ? 8 : 0;
      const area = { x: outer.x, y: outer.y + topExtra, width: outer.width, height: outer.height - topExtra - titleBand };
      layout = layoutCanvas(grid, area, {
        ...this.fitBands(),
        axes: {
          left: valueBand(yOpts0, aggSeries.filter((s) => onAxis(s, 0)), leftSpacingScale),
          right: hasSecondary ? valueBand(yOpts1, secondary, rightSpacingScale) : 8,
          top: catVisible && split ? LAYOUT.tickLength + catLabelOffset : 6,
          bottom: catVisible ? LAYOUT.tickLength + catLabelOffset + TIER_HEIGHT + rotExtra : 6,
        },
        columnHeaders: dims.slice(0, -1).map((_, l) =>
          shown(l) ? header(l)?.size ?? (split ? SPLIT_TIER_PITCH : TIER_HEIGHT) : 0,
        ),
        columnHeaderSide: split ? "top" : "bottom",
      });
      this.noteCanvas(layout, area);
    } else {
      const bottomSpacingScale = this.chromeSpacingScale("bottom");
      const valueBand = (opts: AxisOptions, scale: number) =>
        typeof opts.size === "number" ? opts.size : LAYOUT.defaultBottomAxisHeight + axisLabelOffset(opts) +
        (opts.title?.text && opts.title.enabled !== false
          ? 32 + ((opts.title.margin ?? LAYOUT.axisTitleGap * scale) - 14) + Math.max(0, opts.title.offset ?? 0)
          : 0);
      const widths = tierWidths(leaves);
      const titleW = titleOn
        ? 22 + ((xOpts.title!.margin ?? 16 * this.chromeSpacingScale("left")) - 14) + Math.max(0, xOpts.title!.offset ?? 0)
        : 0;
      const leftExtra = catVisible ? 8 + titleW : 0;
      const rightExtra = catVisible && split ? 8 : 0;
      const area = { x: outer.x + leftExtra, y: outer.y, width: outer.width - leftExtra - rightExtra, height: outer.height };
      layout = layoutCanvas(grid, area, {
        ...this.fitBands(),
        axes: {
          left: catVisible ? LAYOUT.tickLength + catLabelOffset + widths[levels - 1] : 6,
          right: catVisible && split ? LAYOUT.tickLength + catLabelOffset : 8,
          top: hasSecondary ? valueBand(yOpts1, this.chromeSpacingScale("top")) : 6,
          bottom: valueBand(yOpts0, bottomSpacingScale),
        },
        rowHeaders: dims.slice(0, -1).map((_, l) => (shown(l) ? header(l)?.size ?? widths[l] : 0)),
        rowHeaderSide: split ? "right" : "left",
      });
      this.noteCanvas(layout, area);
    }
    const plot = layout.plotArea;
    this.gateDataLabels(plot, visible);
    this.noteCanvasBands(layout, {
      left: inverted ? (catVisible ? xOpts : undefined) : yOpts0,
      right: !inverted && hasSecondary ? yOpts1 : undefined,
      top: inverted && hasSecondary ? yOpts1 : undefined,
      bottom: inverted ? yOpts0 : catVisible ? xOpts : undefined,
    }, { left: inverted ? "xAxis[0]" : "yAxis[0]", right: "yAxis[1]", top: "yAxis[1]", bottom: inverted ? "yAxis[0]" : "xAxis[0]" });

    // One category scale across every pane: the value axes' plot lines find
    // their groups on it, and the header levels their category positions.
    // Panes take shares by their number of categories, so each pane's own
    // scale has this same step.
    const catScale = new CategoryScale({
      categories: keys,
      range: inverted ? [plot.y, plot.y + plot.height] : [plot.x, plot.x + plot.width],
    });
    const valueRange: [number, number] = inverted ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y];
    const scaleFor = (list: BaseSeries[], opts: AxisOptions) => {
      const domainSeries = list.length ? list : aggSeries;
      let [lo, hi] = this.valueDomain(domainSeries, opts);
      const preserveZeroMin = this.hasNonNegativeZeroBasedSeries(domainSeries, lo);
      if (!positiveLog(opts) && reachesZero(opts, true)) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      return this.valueScale(opts, [lo, hi], valueRange, true, preserveZeroMin);
    };
    const synced = hasSecondary && yOpts1.sync === true;
    const valScale0 = scaleFor(synced ? aggSeries : aggSeries.filter((s) => onAxis(s, 0)), yOpts0);
    const valScale1 = !hasSecondary ? valScale0 : synced ? syncedScale(valScale0, valueRange) : scaleFor(secondary, yOpts1);

    const axisLayer = this.renderer.group({ class: "facet-axes" }, this.renderer.root);
    const valAxis0 = new Axis({
      renderer: this.renderer,
      scale: valScale0,
      position: inverted ? "bottom" : "left",
      spacingScale: this.chromeSpacingScale(inverted ? "bottom" : "left"),
      plot,
      cross: catScale,
      options: yOpts0,
      grid: true,
      id: "yAxis[0]",
    });
    valAxis0.render(axisLayer);
    // Each goes in first, so draw the last pane first to keep pane order.
    for (const pane of [...layout.panes].reverse())
      this.drawPlotArea(axisLayer, pane.rect, layout.panes.length > 1 ? pane.key : undefined);
    let valAxis1: Axis | undefined;
    if (hasSecondary) {
      valAxis1 = new Axis({
        renderer: this.renderer,
        scale: valScale1,
        position: inverted ? "top" : "right",
        spacingScale: this.chromeSpacingScale(inverted ? "top" : "right"),
        plot,
        cross: catScale,
        options: yOpts1,
        grid: false,
        id: "yAxis[1]",
      });
      valAxis1.render(axisLayer);
    }
    if (catVisible) {
      new HeaderTiers({
        renderer: this.renderer,
        id: xOpts.id ?? "xAxis[0]",
        layout,
        cells: inverted ? layout.headers.rows : layout.headers.columns,
        fields: dims,
        leaves,
        leafCenter: (i) => catScale.scale(keys[i]),
        step: catScale.fullStep(),
        plot,
        vertical: inverted,
        split,
        axis: xOpts,
        canvas,
        spacingScale: this.chromeSpacingScale(inverted ? "left" : "bottom"),
      }).render(axisLayer);
    }

    // Each pane draws its own categories' points on its own category scale,
    // so a line stops at its group's edge. Series by series, so marks keep
    // their series order.
    const group = this.groupInfo(aggSeries);
    const track = inverted ? grid.rows : grid.columns;
    const panes = layout.panes.map((pane) => {
      const leaf = track.leaves[inverted ? pane.row : pane.column];
      const keys = (leaf.categories ?? []).map((c) => [...leaf.values, c].map((v) => v ?? "").join("\u0000"));
      const r = pane.rect;
      return {
        rect: r,
        keys: new Set(keys),
        scale: new CategoryScale({ categories: keys, range: inverted ? [r.y, r.y + r.height] : [r.x, r.x + r.width] }),
      };
    });
    const existing = new Set(this.renderer.root.children);
    for (const s of aggSeries) {
      const valScale = onAxis(s, 1) ? valScale1 : valScale0;
      for (const pane of panes) {
        const points = s.points.filter((p) => pane.keys.has(String(p.x)));
        if (!points.length) continue;
        const ctx = this.seriesContext(
          s,
          pane.rect,
          inverted ? valScale : pane.scale,
          inverted ? pane.scale : valScale,
          group,
          inverted,
          false,
        );
        s.withPoints(points).render(ctx);
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
      this.renderPanel({ rect: outer, series: this.series });
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
    const bottomReserve =
      LAYOUT.defaultBottomAxisHeight +
      axisLabelOffset(yOpts);
    const gutter = 84;
    const plot: Rect = {
      x: outer.x,
      y: outer.y + 6,
      width: outer.width,
      height: outer.height - bottomReserve - 6,
    };
    const halfW = (plot.width - gutter) / 2;
    // Each series gets one half of the plot.
    this.gateDataLabels({ ...plot, width: halfW }, pair);
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
      spacingScale: this.chromeSpacingScale("bottom"),
      grid: false,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: undefined },
      id: "yAxis[0]",
      instance: "left",
    });
    leftAxis.render(axisLayer);
    const rightAxis = new Axis({
      renderer: this.renderer,
      scale: rightVal,
      position: "bottom",
      spacingScale: this.chromeSpacingScale("bottom"),
      grid: false,
      plot: { x: rightZeroX, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: undefined },
      id: "yAxis[0]",
      instance: "right",
    });
    rightAxis.render(axisLayer);
    this.drawPlotArea(axisLayer, plot);

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
    this.gateDataLabels(
      { x: cx - R, y: cy - R, width: 2 * R, height: 2 * R },
      visible,
    );
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
    this.gateDataLabels(plot, visible);

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
      // A point with no value draws no mark, though its leaf keeps its
      // place on the axis.
      const buckets = new Map<string, Point[]>();
      for (const p of s.points) {
        if (p.y == null) continue;
        const key = dims.map((d) => String(p.options[d] ?? "")).join("\u0000");
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p);
      }
      const pts: Point[] = [];
      for (const [key, group] of buckets) {
        const i = keyIndex.get(key)!;
        const y = this.aggregate(group.map((p) => p.y ?? 0), agg);
        // A leaf of one point keeps that point's own options, so tooltips
        // and events still see them.
        const own = group.length === 1 ? group[0].options : {};
        pts.push({
          x: key,
          index: i,
          y,
          name: leaves[i].join(" / "),
          options: { ...own, y },
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
  ): { xScale: Scale; xScale2?: Scale; yScale: Scale; yScale2?: Scale } {
    const xSource = visible;
    const ySource = visible;
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
    // When inverted it runs across the top, the primary along the bottom.
    const onSecondary = (s: BaseSeries) => (s.options.yAxis ?? 0) === 1;
    const hasSecondary = ySource.some(onSecondary);
    const primaryVisible = hasSecondary
      ? ySource.filter((s) => !onSecondary(s))
      : ySource;

    // Value domain across the primary axis's series only (falls back to all
    // visible series when nothing besides the secondary axis is present, so
    // this can't produce an empty domain). Error bars are typically overlaid
    // on (and read like) a column series, so they share its zero baseline.
    // A synchronised second axis reads on the first's scale, so the first
    // covers both axes' series.
    const synced = hasSecondary && axisAt(this.options.yAxis, 1).sync === true;
    const primaryDomainSeries = primaryVisible.length && !synced
      ? primaryVisible
      : ySource;
    let [vMin, vMax] = this.valueDomain(primaryDomainSeries, yAxisOpts);
    const preservePrimaryZeroMin = this.hasNonNegativeZeroBasedSeries(
      primaryDomainSeries,
      vMin,
    );
    const includeZero = primaryVisible.some((s) =>
      ["column", "bar", "area", "areaspline", "errorbar", "lollipop"].includes(
        s.type,
      ),
    );
    const primaryValueAxis = yAxisOpts;
    if (
      reachesZero(primaryValueAxis, includeZero) &&
      !positiveLog(primaryValueAxis)
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
      if (positiveLog(valueAxisOpts)) {
        const k = logPadFactor(markerR, valuePx, vMin, vMax);
        if (valueAxisOpts.min === undefined) vMin /= k;
        if (valueAxisOpts.max === undefined) vMax *= k;
      } else {
        const padY = (markerR / Math.max(1, valuePx)) * (vMax - vMin || 1);
        if (valueAxisOpts.min === undefined) vMin -= padY;
        if (valueAxisOpts.max === undefined) vMax += padY;
      }
    }

    // Data-label headroom: an 'outside'/'top' (or default, for non-stacked)
    // label sits just beyond its bar/point — without extra room, a value
    // that lands on the domain max renders its label flush against (or past)
    // the plot edge, overlapping the title/chrome above it. Skipped when the
    // user set an explicit max (they're opting out of auto-headroom).
    const labelRoom = this.labelHeadroom(primaryVisible, inverted);
    const dataMax = vMax;
    if (labelRoom) {
      const valueAxisOpts = yAxisOpts;
      const valuePx = inverted ? plot.width : plot.height;
      if (valueAxisOpts.max === undefined) {
        if (positiveLog(valueAxisOpts))
          vMax *= logPadFactor(labelRoom, valuePx, vMin, vMax);
        else vMax += (labelRoom / Math.max(1, valuePx)) * (vMax - vMin || 1);
      }
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
      if (markerR && positiveLog(opts)) {
        const k = logPadFactor(markerR, plot.width, min, max);
        if (opts.min === undefined) min /= k;
        if (opts.max === undefined) max *= k;
      } else if (markerR) {
        const padX = (markerR / Math.max(1, plot.width)) * (max - min || 1);
        if (opts.min === undefined) min -= padX;
        if (opts.max === undefined) max += padX;
      }
      if (opts.startOnZero === true && !positiveLog(opts)) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
      if (opts.type === "log") return logScale(opts, [min, max], range, reversed);
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
      const ticks = fixedTicks(opts, min, max);
      return new LinearScale({
        domain: [min, max],
        range,
        tickCount: opts.tickCount,
        ...(reversed ? { reversed } : {}),
        ...(ticks ? { ticks } : {}),
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

    // The secondary value scale over `range`: its own domain, zero kept in
    // for bars and areas, and room for its labels.
    const secondaryScale = (range: [number, number], primary: Scale): Scale | undefined => {
      if (!hasSecondary) return undefined;
      if (synced) return syncedScale(primary, range);
      const secondaryVisible = ySource.filter(onSecondary);
      const secondaryOpts = axisAt(this.options.yAxis, 1);
      let [vMin2, vMax2] = this.valueDomain(secondaryVisible, secondaryOpts);
      const preserveSecondaryZeroMin = this.hasNonNegativeZeroBasedSeries(
        secondaryVisible,
        vMin2,
      );
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
      if (
        reachesZero(secondaryOpts, includeZero2) &&
        !positiveLog(secondaryOpts)
      ) {
        vMin2 = Math.min(vMin2, 0);
        vMax2 = Math.max(vMax2, 0);
      }
      const labelRoom2 = this.labelHeadroom(secondaryVisible, inverted);
      return this.fitLabelHeadroom(
        secondaryOpts,
        [vMin2, vMax2],
        range,
        preserveSecondaryZeroMin,
        vMax2,
        labelRoom2,
      );
    };

    if (inverted) {
      // Horizontal bars: value on x (bottom), categories on y (left).
      const xScale = this.fitLabelHeadroom(
        yAxisOpts,
        [vMin, vMax],
        [plot.x, plot.x + plot.width],
        preservePrimaryZeroMin,
        dataMax,
        labelRoom,
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
      // `yScale2` stays the secondary *value* scale, here horizontal.
      const yScale2 = secondaryScale([plot.x, plot.x + plot.width], xScale);
      return { xScale, yScale, yScale2 };
    }

    let xRange: [number, number] = [plot.x, plot.x + plot.width];
    const primaryX = primaryXSource.length ? primaryXSource : xSource;
    let xScale = horizontalScale(primaryX, xAxisOpts, categories, xRange);
    // Labels beside their points (left or right) that would stick out of
    // the plot: the points move in, so they fit.
    const [inLeft, inRight] = this.sideLabelOverflow(primaryX, xScale, xRange);
    if ((inLeft || inRight) && inLeft + inRight < plot.width / 2) {
      xRange = [plot.x + inLeft, plot.x + plot.width - inRight];
      xScale = horizontalScale(primaryX, xAxisOpts, categories, xRange);
    }
    const xScale2 = secondaryXSource.length
      ? horizontalScale(
          secondaryXSource,
          xAxisOpts2,
          this.currentCategories(secondaryXSource, 1),
          xRange,
        )
      : undefined;
    const yScale = this.fitLabelHeadroom(
      yAxisOpts,
      [vMin, vMax],
      [plot.y + plot.height, plot.y],
      preservePrimaryZeroMin,
      dataMax,
      labelRoom,
    );

    const yScale2 = secondaryScale([plot.y + plot.height, plot.y], yScale);
    return { xScale, xScale2, yScale, yScale2 };
  }

  /**
   * How far data labels set beside their points (`left` / `right`, for
   * every point, the first or last, or a point of its own) would stick out
   * of the plot's left and right edges, `range`, with the points drawn by
   * `xScale`: line, area and scatter labels, not rotated.
   */
  private sideLabelOverflow(series: BaseSeries[], xScale: Scale, range: [number, number]): [number, number] {
    let left = 0;
    let right = 0;
    for (const s of series) {
      if (!SIDE_LABEL_TYPES.has(s.type) || s.points.length > 5000) continue;
      const dl = s.options.dataLabels;
      if (!dl || !labelsWanted(dl)) continue;
      const beside = (pos: string | undefined) => pos === "left" || pos === "right";
      if (!dl.pointOf && !beside(dl.position) && !beside(dl.first?.position) && !beside(dl.last?.position)) continue;
      const ends = labelEnds(s.points);
      const total = s.points.reduce((sum, p) => sum + (p.y ?? 0), 0);
      for (const p of s.points) {
        if (p.y == null) continue;
        const ctx: LabelContext = {
          x: p.x, y: p.y, point: p.options, series: s.name,
          name: p.name ?? p.x, index: p.index, color: p.color ?? s.color,
          total, percentage: total ? (p.y / total) * 100 : undefined,
        };
        const own = pointLabelOptions(dl, ctx, ends);
        if (!own || own.rotation || !beside(own.position)) continue;
        const px = xScale.scale(p.x as never);
        if (!Number.isFinite(px)) continue;
        const text = labelString(own, ctx);
        if (!text) continue;
        const w = this.renderer.measureText(text, { "font-size": dataLabelFontSize(own), ...dataLabelTextAttrs(own) }).width;
        const gap = 8 + (own.distance ?? 0);
        const at = px + (own.offsetX ?? 0);
        if (own.position === "left") left = Math.max(left, range[0] - (at - gap - w) + 2);
        else right = Math.max(right, at + gap + w - range[1] + 2);
      }
    }
    return [Math.ceil(left), Math.ceil(right)];
  }

  /**
   * Pixels an 'outside'/'top' data label needs beyond its point/bar along
   * the value axis: the gap the series leaves, the label's own height, plus
   * any `distance` and offset that pushes it further out. 0 when no
   * series draws such a label.
   */
  private labelHeadroom(series: BaseSeries[], inverted: boolean): number {
    let room = 0;
    for (const s of series) {
      const dl = s.options.dataLabels;
      if (!dl?.enabled) continue;
      if (
        dl.position !== undefined &&
        dl.position !== "outside" &&
        dl.position !== "top"
      )
        continue;
      const fontPx = parseFloat(dataLabelFontSize(dl)) || 11;
      const outward = inverted ? (dl.offsetX ?? 0) : -(dl.offsetY ?? 0);
      const need =
        (inverted ? 18 : 7 + this.turnedLabelHeight(s, dl, fontPx)) +
        (dl.distance ?? 0) +
        Math.max(0, outward);
      room = Math.max(room, need, 18);
    }
    return room;
  }

  /**
   * How tall `s`'s tallest data label stands: its font size, or, turned
   * by `dl.rotation`, as much of its longest text as the turn stands up.
   */
  private turnedLabelHeight(s: BaseSeries, dl: DataLabelOptions, fontPx: number): number {
    if (!dl.rotation) return fontPx;
    const r = (dl.rotation * Math.PI) / 180;
    const style = { "font-size": dataLabelFontSize(dl), ...dataLabelTextAttrs(dl) };
    let w = 0;
    for (const p of s.points) {
      const text = labelString(dl, {
        x: p.x,
        y: p.y,
        point: p.options,
        series: s.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? s.color,
      });
      if (text) w = Math.max(w, this.renderer.measureText(text, style).width);
    }
    return Math.max(fontPx * Math.abs(Math.cos(r)), w * Math.abs(Math.sin(r)) + fontPx * Math.abs(Math.cos(r)) * 0.5);
  }

  /**
   * Build a value scale, then grow its auto max until the top data value
   * leaves `room` pixels for its label. The up-front padding estimates this
   * from the raw domain, but nice-rounding the min (notably on a log axis,
   * where it can add most of a decade) shrinks that padding afterwards.
   */
  private fitLabelHeadroom(
    opts: AxisOptions,
    domain: [number, number],
    range: [number, number],
    preserveZeroMin: boolean,
    dataMax: number,
    room: number,
  ): Scale {
    let scale = this.valueScale(opts, domain, range, true, preserveZeroMin);
    if (!room || opts.max !== undefined || opts.reversed) return scale;
    const axisPx = Math.abs(range[1] - range[0]);
    let max = domain[1];
    for (let i = 0; i < 4; i++) {
      const free = Math.abs(range[1] - scale.scale(dataMax));
      if (free >= room) break;
      const [lo, hi] = (scale as LinearScale | LogScale).domain;
      const short = room - free + 1;
      if (positiveLog(opts)) max = hi * logPadFactor(short, axisPx, lo, hi);
      else max = hi + (short / Math.max(1, axisPx)) * (hi - lo || 1);
      scale = this.valueScale(opts, [lo, max], range, false, preserveZeroMin);
    }
    return scale;
  }

  private valueScale(
    opts: AxisOptions,
    domain: [number, number],
    range: [number, number],
    padDomain = true,
    preserveZeroMin = false,
  ): Scale {
    let min = opts.min ?? domain[0];
    let max = opts.max ?? domain[1];
    if (positiveLog(opts)) {
      // A logarithmic axis needs multiplicative padding so its lower bound
      // remains positive. Explicit bounds continue to opt out independently.
      if (padDomain && opts.min === undefined)
        min /= 1 + VALUE_DOMAIN_PADDING;
      if (padDomain && opts.max === undefined)
        max *= 1 + VALUE_DOMAIN_PADDING;
      return logScale(opts, [min, max], range, opts.reversed);
    }
    // A symmetric log axis snaps its own ends out to powers.
    if (opts.type === "log") return logScale(opts, [min, max], range, opts.reversed);

    if (padDomain) {
      const domainSpan = max - min || Math.abs(max) || Math.abs(min) || 1;
      const padding = domainSpan * VALUE_DOMAIN_PADDING;
      const lo = min;
      const hi = max;
      if (
        opts.min === undefined &&
        !(preserveZeroMin && min === 0)
      )
        min -= padding;
      if (opts.max === undefined) max += padding;
      // Padding never takes values all on one side of zero across it: an
      // axis that needn't reach zero still shouldn't show a negative step
      // under positive values (or a positive one over negative values).
      if (lo >= 0 && min < 0) min = 0;
      if (hi <= 0 && max > 0) max = 0;
    }

    const ticks = fixedTicks(opts, min, max);
    return new LinearScale({
      domain: [min, max],
      range,
      tickCount: opts.tickCount ?? 4,
      reversed: opts.reversed,
      niceMin: opts.min === undefined,
      niceMax: opts.max === undefined,
      ...(ticks ? { ticks } : {}),
    });
  }

  private valueDomain(
    visible: BaseSeries[],
    axis?: AxisOptions,
  ): [number, number] {
    const log = !!axis && positiveLog(axis);
    const mins: number[] = [];
    const maxs: number[] = [];
    for (const s of visible) {
      if (!s.capabilities().cartesian) continue;
      // A log axis skips non-positive values (e.g. a column's zero
      // baseline): log(0) is -infinity and would drag the axis down to the
      // scale's epsilon, squashing every bar into the top of the plot.
      // An axis told not to reach zero leaves columns' baselines out.
      const extent = log ? s.positiveValueExtent() : axis?.startOnZero === false ? s.dataExtent() : s.valueExtent();
      if (!extent) continue;
      mins.push(extent[0]);
      maxs.push(extent[1]);
    }
    if (!mins.length) return log ? [1, 10] : [0, 1];
    return [Math.min(...mins), Math.max(...maxs)];
  }

  private hasNonNegativeZeroBasedSeries(
    series: BaseSeries[],
    domainMin: number,
  ): boolean {
    return (
      domainMin >= 0 &&
      series.some((item) =>
        ["column", "bar", "area", "areaspline"].includes(item.type),
      )
    );
  }

  /** A continuous x scale on the canvas: an explicitly linear axis is
   * scaled as a value axis is (its min and max, nice ticks by its width,
   * room at the ends); otherwise its points' extent. Beside other panels,
   * a tick at its right edge is left out. */
  private continuousX(xOpts: AxisOptions, domain: [number, number], range: [number, number], besideOthers = false, inverted = false, gap = 0): Scale {
    // About one tick per 70px, so narrow panels' labels don't run together.
    const ticks = Math.max(2, Math.min(8, Math.round(Math.abs(range[1] - range[0]) / 70)));
    if (xOpts.type === "datetime") {
      // A timeline: half a period's room at each end, and date ticks
      // (years, months, days…) inside, labelled by their unit.
      if (inverted) range = [range[1], range[0]];
      const pad = gap > 0 ? gap / 2 : (domain[1] - domain[0]) * 0.02 || 86_400_000;
      const min = xOpts.min ?? domain[0] - pad;
      const max = xOpts.max ?? domain[1] + pad;
      const { ticks: dates, format } = niceDateTicks(min, max, ticks);
      const inside = dates.filter((t) => t >= min && t <= max);
      return new LinearScale({ domain: [min, max], range, reversed: xOpts.reversed, ticks: inside, niceMin: false, niceMax: false, endTicks: false, format: (v) => formatDate(v, format) });
    }
    if (xOpts.type === "linear") {
      // Up the side of a bar chart, values grow upwards.
      if (inverted) range = [range[1], range[0]];
      const sc = this.linearX(xOpts.tickCount != null || xOpts.tickInterval != null ? xOpts : { ...xOpts, tickCount: ticks }, domain, range);
      // Panels side by side: a tick at a panel's right edge would run into
      // the next panel's first, so it's left out.
      if (!besideOthers || !(sc instanceof LinearScale)) return sc;
      const vals = sc.ticks() as number[];
      const last = vals[vals.length - 1];
      return vals.length > 1 && last != null && Math.abs(range[1] - sc.scale(last)) < 14
        ? new LinearScale({ domain: sc.domain, range, ticks: vals.slice(0, -1), format: (sc as unknown as { format?: (v: number) => string }).format })
        : sc;
    }
    return new LinearScale({ domain, range, reversed: xOpts.reversed });
  }

  /** An explicitly linear x scale: it runs from just below its smallest
   * value to just above its largest (room for half a column and a little
   * more), not out to the next round tick, so marks use the width; its
   * own min or max are kept, and so is zero when all values are on one
   * side of it. Ticks are round values inside. */
  private linearX(opts: AxisOptions, [lo, hi]: [number, number], range: [number, number]): Scale {
    if (opts.type !== "linear" || positiveLog(opts)) return this.valueScale(opts, [lo, hi], range, true, true);
    const px = Math.abs(range[1] - range[0]);
    const column = Math.max(4, Math.min(24, px * 0.08));
    const padPx = column / 2 + 6;
    const span = hi - lo || Math.abs(hi) || 1;
    const pad = (span * padPx) / Math.max(1, px - 2 * padPx);
    let min = opts.min ?? lo - pad;
    let max = opts.max ?? hi + pad;
    if (opts.min === undefined && lo >= 0 && min < 0) min = Math.min(0, lo);
    if (opts.max === undefined && hi <= 0 && max > 0) max = Math.max(0, hi);
    if (max <= min) max = min + 1;
    // Round ticks inside the range: a finer step when a coarse one leaves
    // fewer than two (0..31 asked for two ticks steps by 50).
    const inside = (count: number) => niceTicks(min, max, count).filter((v) => v >= min - 1e-9 && v <= max + 1e-9);
    const want = opts.tickCount ?? 4;
    let ticks = fixedTicks(opts, min, max) ?? inside(want);
    for (let count = want + 1; ticks.length < 2 && count <= want + 4; count++) ticks = inside(count);
    return new LinearScale({ domain: [min, max], range, reversed: opts.reversed, ticks, niceMin: false, niceMax: false, endTicks: false });
  }

  /** The smallest step between neighbouring x values of the series: a
   * timeline's period, about. */
  private xMinGap(visible: BaseSeries[]): number {
    const xs = [...new Set(visible.flatMap((s) => s.points.map((p) => p.x)).filter((x): x is number => typeof x === "number"))].sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      if (d > 0 && (!gap || d < gap)) gap = d;
    }
    return gap;
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
    "tick",
  ]);

  private currentCategories(
    visible: BaseSeries[],
    axisIndex = 0,
  ): string[] | undefined {
    const xAxis = axisAt(this.options.xAxis, axisIndex);
    if (xAxis?.categories) return xAxis.categories;
    // A datetime or linear x-axis stays numeric even for bar-family series
    // (columns placed at numbers).
    const banded =
      xAxis?.type === "category" ||
      (xAxis?.type !== "datetime" &&
        xAxis?.type !== "linear" &&
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
      // `grouping: false` pulls a series out of the side-by-side layout so it
      // paints across the full category band — overlapping any other
      // `grouping: false` series instead of taking its own slot. Flagged with
      // a sentinel index rather than a column key; seriesContext() below
      // turns it into a solo {count: 1, index: 0} for that series only.
      if (s.options.grouping === false && !s.options.stacking) {
        index.set(s.index, -1);
        continue;
      }
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
    const rawIndex = group.index.get(s.index) ?? 0;
    const overlapped = rawIndex === -1;
    return {
      renderer: this.renderer,
      plot,
      xScale,
      yScale,
      color: s.color,
      colors: this.colors,
      inverted,
      polar,
      groupCount: overlapped ? 1 : group.count,
      groupIndex: overlapped ? 0 : rawIndex,
      onPointEvent: (kind, p, dom) => this.handlePointEvent(kind, s, p, dom),
      registerHover: (el, p) => this.bindPointInteraction(el, s, p),
      suppressDataLabels: this.labelsSuppressed,
    };
  }

  private bindPointInteraction(el: SVGElement, s: BaseSeries, p: Point): void {
    // Hover scale/highlight animation — independent of the tooltip.
    this.applyHover(el, s);
    this.bindPointAccessibility(el, s, p);
    el.addEventListener("contextmenu", (e) =>
      this.handlePointEvent("contextMenu", s, p, e),
    );

    if (!this.tooltip) return;
    const build = (): TooltipContext => {
      let total = this.seriesTotals.get(s);
      if (total === undefined) {
        total = s.points.reduce((sum, pt) => sum + (pt.y ?? 0), 0);
        this.seriesTotals.set(s, total);
      }
      const ctx: TooltipContext = {
        series: s.name,
        seriesIndex: this.series.indexOf(s),
        seriesOptions: s.options,
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
    let exposed = this.accessibleBySeries.get(s);
    if (!exposed) this.accessibleBySeries.set(s, (exposed = new Set()));
    if (exposed.has(p)) {
      el.setAttribute("aria-hidden", "true");
      return;
    }

    exposed.add(p);
    this.accessiblePoints.push({ el, series: s, point: p });
    el.classList.add("facet-a11y-point");
    el.setAttribute("role", "img");
    el.setAttribute("aria-roledescription", "data point");
    el.setAttribute("aria-label", this.pointAccessibilityLabel(s, p));

    if (accessibility?.keyboardNavigation === false) return;
    el.setAttribute("tabindex", this.accessiblePoints.length === 1 ? "0" : "-1");
    el.setAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space ContextMenu Shift+F10",
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
      } else if (
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey)
      ) {
        this.handlePointEvent("contextMenu", s, p, event);
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
    this.series.forEach((s, seriesIndex) => {
      if (!s.visible || !s.capabilities().cartesian || s.options.tooltip?.enabled === false) return;
      const match = s.points.find((pp) => String(pp.x) === String(x));
      if (!match) return;
      rows.push({
        series: s.name,
        seriesIndex,
        seriesOptions: s.options,
        x: match.name ?? match.x,
        y: match.y ?? match.high,
        low: match.low,
        high: match.high,
        point: match.options,
        color: match.color ?? s.color,
      });
    });
    return rows;
  }

  /**
   * Subtle hover highlight (brightness only). Scaling was reverted — it looked
   * jarring — but remains opt-in via `states.hover.scale` for anyone who wants
   * it, as does a border (`states.hover.borderWidth`).
   */
  private applyHover(el: SVGElement, s: BaseSeries): void {
    const hover = s.options.states?.hover;
    if (hover?.enabled === false) return;
    const scale = hover?.scale ?? 0;
    const brightness = hover?.brightness ?? 0.08;
    const border = hover?.borderWidth ?? 0;
    const style = el.style as CSSStyleDeclaration & { transformBox: string };
    style.transition = "filter 0.12s ease";
    el.addEventListener("mouseenter", () => {
      style.filter = `brightness(${1 + brightness})`;
      if (border && !hidden(el)) {
        const fill = el.getAttribute("fill");
        const own = fill && !fill.startsWith("url(") ? fill : s.color;
        style.stroke =
          hover?.borderColor ?? `color-mix(in srgb, ${own} 60%, black)`;
        style.strokeWidth = String(border);
      }
      if (scale) {
        style.transformBox = "fill-box";
        style.transformOrigin = "center";
        style.transition = "transform 0.12s ease, filter 0.12s ease";
        style.transform = `scale(${scale})`;
      }
    });
    el.addEventListener("mouseleave", () => {
      style.filter = "";
      style.stroke = "";
      style.strokeWidth = "";
      if (scale) style.transform = "";
    });
  }

  private handlePointEvent(
    kind: "click" | "contextMenu" | "mouseOver" | "mouseOut",
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
    if (kind === "contextMenu" && se?.contextMenu) {
      dom.preventDefault();
      se.contextMenu(payload);
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

  private buildLegendItems(): Array<
    LegendItem & { seriesIndex?: number; seriesIndexes?: number[] }
  > {
    const first = this.series[0];
    const scales = [...this.colorScaleLegendItems(), ...this.colorKeyLegendItems()];
    if (this.series.length === 1 && first?.options.showInLegend === false) {
      return scales;
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
    const items: Array<LegendItem & { seriesIndex?: number; seriesIndexes?: number[] }> = [];
    // Series sharing a legend key: the item they share.
    const keyed = new Map<string, LegendItem & { seriesIndexes: number[] }>();
    let group: string | undefined;
    // Each item's key for `legend.order`.
    const orderKeys = new Map<LegendItem & { seriesIndex?: number; seriesIndexes?: number[] }, string>();
    this.series.forEach((s, seriesIndex) => {
      if (s.options.showInLegend === false) return;
      const key = s.options.legendKey;
      const shared = key != null ? keyed.get(key) : undefined;
      if (shared) {
        shared.seriesIndexes.push(seriesIndex);
        shared.visible ||= s.visible;
        return;
      }
      // A heading before each run of series in a legend group.
      const g = s.options.legendGroup || undefined;
      if (g && g !== group) items.push({ label: g, color: "", visible: true, heading: true });
      group = g;
      if (key != null) {
        const item = { label: s.options.legendLabel ?? s.name, color: s.color, visible: s.visible, seriesIndexes: [seriesIndex] };
        keyed.set(key, item);
        items.push(item);
        orderKeys.set(item, key);
      } else {
        const item = { label: s.name, color: s.color, visible: s.visible, seriesIndex };
        items.push(item);
        orderKeys.set(item, s.name);
      }
    });
    return [...scales, ...this.orderLegendItems(items, orderKeys)];
  }

  /** `legend.order`: the listed items, in its order, in the places listed
   *  items had; the rest (and headings) stay put. */
  private orderLegendItems<T extends LegendItem>(items: T[], keys: Map<T, string>): T[] {
    const order = this.options.legend?.order;
    if (!order?.length) return items;
    const rank = new Map(order.map((k, i) => [k, i]));
    const at = items.map((item, i) => (rank.has(keys.get(item) ?? "") ? i : -1)).filter((i) => i >= 0);
    const sorted = at.map((i) => items[i]).sort((a, b) => rank.get(keys.get(a)!)! - rank.get(keys.get(b)!)!);
    const out = [...items];
    at.forEach((i, j) => (out[i] = sorted[j]));
    return out;
  }

  /** `legend.colorKeys` as legend items: each key's heading, then its swatches. */
  private colorKeyLegendItems(): LegendItem[] {
    return (this.options.legend?.colorKeys ?? []).flatMap((k) => [
      ...(k.label ? [{ label: k.label, color: "", visible: true, heading: true }] : []),
      ...k.items.map((item) => ({ label: item.label, color: item.color, visible: true, key: true })),
    ]);
  }

  /** `legend.colorScales` as legend items; visible while any of their series is. */
  private colorScaleLegendItems(): Array<LegendItem & { seriesIndexes?: number[] }> {
    return (this.options.legend?.colorScales ?? []).map((scale) => {
      const indexes = (scale.series ?? []).filter((i) => this.series[i]);
      return {
        label: scale.label ?? "",
        color: scale.colors[scale.colors.length - 1] ?? "",
        visible: !indexes.length || indexes.some((i) => this.series[i].visible),
        scale: { min: scale.min, max: scale.max, colors: scale.colors },
        seriesIndexes: indexes,
      };
    });
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
    const item = this.buildLegendItems()[index];
    // A colour scale toggles all the series it stands for together.
    if (item?.scale) {
      const indexes = item.seriesIndexes ?? [];
      if (!indexes.length) return;
      for (const i of indexes) this.series[i].visible = !item.visible;
      this.options.seriesEvents?.legendItemClick?.({
        series: item.label,
        visible: !item.visible,
      });
      this.render();
      return;
    }
    // A group's heading, or a colour key's swatch, stands for nothing to toggle.
    if (item?.heading || item?.key) return;
    // An item for series sharing a legend key toggles them all.
    if (item?.seriesIndexes) {
      for (const i of item.seriesIndexes) if (this.series[i]) this.series[i].visible = !item.visible;
      this.options.seriesEvents?.legendItemClick?.({
        series: item.label,
        visible: !item.visible,
      });
      this.render();
      return;
    }
    // Filtered series legends need to retain their original series index.
    const seriesIndex = item?.seriesIndex ?? index;
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
   * use one entry per point when configured with one series; multi-series
   * charts such as stacked radial bars use one entry per series. Check
   * `legendItems.length`/`hasLegend` to decide whether a legend is meaningful.
   */
  get legendItems(): LegendItem[] {
    return this.buildLegendItems();
  }

  /** Whether a legend will actually render (respects `legend.enabled` and needs >1 entry, or a colour scale). */
  get hasLegend(): boolean {
    return (
      this.options.legend?.enabled !== false &&
      (this.buildLegendItems().length > 1 ||
        this.buildLegendItems().some((item) => item.scale || item.key))
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

/** A band a resize handle can drag: its edge facing the panes moves. */
interface ResizeBand {
  kind: "axis" | "header";
  id: string;
  side: "left" | "right" | "top" | "bottom";
  rect: Rect;
  size: number;
}

/** The grid of a chart with nothing on its Rows or Columns: one pane. */
const SINGLE_PANE = buildCanvasGrid({ records: [] });

interface PanelSpec {
  rect: Rect;
  series: BaseSeries[];
  /** Which pane this is, when the chart has several. */
  instance?: string;
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

/** Height of the band naming pane columns. */
const PANE_NAME_HEIGHT = 20;
/** The widest the names at the left of pane rows get, cut short past it. */
const PANE_NAME_MAX = 140;

/** The smallest rectangle holding all of `rects`. */
function rectAround(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** A boosted point's pixel position, for nearest-point hover lookup. */
interface BoostHit {
  x: number;
  y: number;
  point: Point;
  series: BaseSeries;
  /** A bar's rectangle: hovered with the pointer inside it. */
  rect?: Rect;
}

/** An invisible hit area (a line's hover target, say): no hover border on it. */
function hidden(el: SVGElement): boolean {
  const fill = el.getAttribute("fill");
  return (
    fill === "none" ||
    fill === "transparent" ||
    el.getAttribute("opacity") === "0" ||
    el.getAttribute("fill-opacity") === "0"
  );
}

/** A log axis that skips values at or below zero (not a symmetric one). */
function positiveLog(opts: AxisOptions): boolean {
  return opts.type === "log" && opts.log?.mode !== "symmetric";
}

/**
 * Whether a value axis reaches zero: always with `startOnZero: true`, never
 * with `false`, else when its marks grow from zero (`byDefault`).
 */
function reachesZero(opts: AxisOptions, byDefault: boolean): boolean {
  return opts.startOnZero ?? byDefault;
}

/** The axis's fixed ticks over [lo, hi]: every `tickInterval` from `tickOrigin`, none for `'none'`, else undefined (automatic). */
function fixedTicks(opts: AxisOptions, lo: number, hi: number): number[] | undefined {
  if (opts.tickInterval === "none") return [];
  if (typeof opts.tickInterval === "number") {
    // Counted from an origin, a tick may fall just past zero; values all on
    // one side of it keep the axis there.
    return intervalTicks(lo, hi, opts.tickInterval, opts.tickOrigin ?? 0).filter(
      (t) => !(lo >= 0 && t < 0) && !(hi <= 0 && t > 0),
    );
  }
  return undefined;
}

/** A logarithmic scale for `opts`: symmetric (through zero) or positive, on its base. */
function logScale(opts: AxisOptions, domain: [number, number], range: [number, number], reversed?: boolean): Scale {
  const ticks = opts.tickInterval === "none" ? [] : undefined;
  if (opts.log?.mode === "symmetric")
    return new SymLogScale({ domain, range, reversed, base: opts.log.base, ...(ticks ? { ticks } : {}) });
  return new LogScale({
    domain,
    range,
    reversed,
    base: opts.log?.base,
    niceMin: opts.min === undefined,
    niceMax: opts.max === undefined,
    ...(ticks ? { ticks } : {}),
  });
}

/** A second value axis's scale on `primary`'s range and ticks, over `range`. */
function syncedScale(primary: Scale, range: [number, number]): Scale {
  const domain = (primary as LinearScale).domain;
  if (primary instanceof LogScale || primary instanceof SymLogScale || !domain) return primary;
  return new LinearScale({ domain, range, ticks: primary.ticks() as number[], nice: false });
}
