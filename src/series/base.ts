/**
 * Abstract base every concrete series extends.
 *
 * The {@link Chart} performs shared layout (scales, stacking, grouping) and
 * hands each series a {@link SeriesRenderContext}. A series only has to know how
 * to turn its normalised points into SVG — keeping each chart type a small,
 * self-contained, hand-maintainable module.
 */

import type { Renderer } from '../core/renderer.js';
import type { Scale } from '../core/scale.js';
import type { Rect } from '../core/axis.js';
import type { Point } from '../core/point.js';
import type { SeriesOptions, ChartType, FacetChartPointEvent } from '../core/options.js';
import { normalizePoints } from '../core/point.js';

/** A single legend entry produced by a series' custom legend provider. */
export interface LegendEntry {
  label: string;
  color: string;
  visible: boolean;
}

export interface SeriesRenderContext {
  renderer: Renderer;
  plot: Rect;
  xScale: Scale;
  yScale: Scale;
  /** Resolved base colour for this series. */
  color: string;
  /** Full palette, for per-point colouring (pie etc.). */
  colors: string[];
  inverted: boolean;
  polar: boolean;
  /** Number of side-by-side (grouped) bar/column series. */
  groupCount: number;
  /** This series' slot within a group (0-based). */
  groupIndex: number;
  /** Called by a series when a point is interacted with. */
  onPointEvent: (kind: 'click' | 'mouseOver' | 'mouseOut', p: Point, dom: Event) => void;
  /** Registers a hoverable region + its tooltip payload. */
  registerHover: (el: SVGElement, p: Point) => void;
}

/** Metadata used by the chart's layout engine. */
export interface SeriesCapabilities {
  /** Participates in categorical grouping (side-by-side bars). */
  grouped: boolean;
  /** Draws on a cartesian plane (has x/y axes). */
  cartesian: boolean;
  /** Can be stacked. */
  stackable: boolean;
  /** Legend lists this series' points/slices (pie, donut, radialbar, funnel). */
  pointLegend?: boolean;
}

export abstract class BaseSeries {
  readonly type: ChartType;
  readonly name: string;
  readonly options: SeriesOptions;
  points: Point[];
  visible: boolean;
  /** Assigned by the chart. */
  index = 0;
  color = '#000';
  /**
   * Point indices hidden via the legend (used by point-legend charts such as
   * pie / donut / radial bar). Rendering skips these points.
   */
  hiddenPoints = new Set<number>();

  constructor(options: SeriesOptions, categories?: string[]) {
    this.options = options;
    this.type = options.type ?? 'line';
    this.name = options.name ?? `Series ${''}`;
    this.visible = options.visible !== false;
    this.points = normalizePoints(options.data, categories);
  }

  /** Points that should actually be drawn (respects per-point hiding). */
  protected visiblePoints(): Point[] {
    if (this.hiddenPoints.size === 0) return this.points;
    return this.points.filter((p) => !this.hiddenPoints.has(p.index));
  }

  abstract capabilities(): SeriesCapabilities;

  /**
   * The [min, max] value range this series contributes to the value axis,
   * given whether it is stacked (stack totals are precomputed on points).
   */
  valueExtent(): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const p of this.points) {
      for (const v of this.pointValues(p)) {
        if (v === undefined) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return [0, 1];
    return [min, max];
  }

  /** Values a point contributes to the value axis. Overridden by range/box. */
  protected pointValues(p: Point): Array<number | undefined> {
    if (p.stackHigh !== undefined) return [p.stackLow, p.stackHigh];
    return [p.y];
  }

  abstract render(ctx: SeriesRenderContext): void;

  /**
   * Optional custom legend items (e.g. a multi-level pie whose legend lists the
   * inner-dimension groups rather than every raw point). Return `undefined` to
   * fall back to the default point/series legend.
   */
  legendItems?(colors: string[]): LegendEntry[] | undefined;

  /** Handle a click on a custom legend item (paired with {@link legendItems}). */
  onLegendToggle?(index: number): void;

  /**
   * Return a shallow clone of this series containing only the points whose
   * option fields match every entry in `filters` (ignoring empty keys / values).
   * Used by the trellis engine to split a series across small-multiple panels.
   */
  filterByDimensions(filters: Record<string, unknown>): BaseSeries {
    const active = Object.entries(filters).filter(
      ([k, v]) => k !== '' && v !== undefined,
    );
    if (!active.length) return this;
    const clone: BaseSeries = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.points = this.points.filter((p) =>
      active.every(([k, v]) => String(p.options[k]) === String(v)),
    );
    return clone;
  }

  /** Return a shallow clone of this series with a replaced point set. */
  withPoints(points: Point[]): BaseSeries {
    const clone: BaseSeries = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.points = points;
    return clone;
  }

  /** Build the event payload for a point. */
  protected event(kind: string, p: Point, dom?: Event): FacetChartPointEvent {
    return {
      type: kind,
      seriesName: this.name,
      seriesIndex: this.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      point: p.options,
      domEvent: dom,
    };
  }
}
