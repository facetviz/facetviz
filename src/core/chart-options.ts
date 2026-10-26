/**
 * Normalisation helpers used by the chart controller.
 *
 * These are kept separate from rendering so option resolution can remain
 * deterministic and easy to reuse as the chart grows.
 */
import type { AxisOptions, ChartOptions, ChartType, SeriesOptions } from "./options.js";
import { DEFAULT_OPTIONS } from "./defaults.js";
import { merge } from "./utils.js";

/**
 * Baseline chrome for a sparkline: no axes, no legend, minimal spacing — the
 * whole point is a bare trend line sized for a table cell. Layered in
 * *before* the user's own options, so any of these can still be overridden
 * (e.g. turning the x-axis back on) same as any other default.
 */
const SPARKLINE_DEFAULTS: Partial<ChartOptions> = {
  chart: { spacing: [2, 2, 2, 2] },
  xAxis: { visible: false },
  yAxis: { visible: false },
  legend: { enabled: false },
};

/** Apply global and per-type plot options to every series. */
export function resolveChartOptions(user: ChartOptions): ChartOptions {
  const sparkline =
    user.chart?.type === "sparkline" ? SPARKLINE_DEFAULTS : {};
  const merged = merge(
    {} as ChartOptions,
    DEFAULT_OPTIONS as ChartOptions,
    sparkline as ChartOptions,
    user,
  );
  const globalType = merged.chart?.type ?? "line";
  const plot = merged.plotOptions ?? {};
  merged.series = user.series.map((series) => {
    const type = (series.type ?? globalType) as ChartType;
    return merge(
      {} as SeriesOptions,
      plot.series ?? {},
      plot[type] ?? {},
      { type },
      series,
    );
  });
  merged.xAxis = resolveAxes(merged.xAxis, "xAxis", merged);
  merged.yAxis = resolveAxes(merged.yAxis, "yAxis", merged);
  return merged;
}

/**
 * Each axis with its `canvas.axes` settings laid over it (by its `id`, or
 * `xAxis[0]`…), and its `range` read into the bounds the scales use:
 * `fixed` start / end become `min` / `max`, `includeZero` `startOnZero`.
 */
function resolveAxes(
  axis: AxisOptions | AxisOptions[] | undefined,
  kind: "xAxis" | "yAxis",
  options: ChartOptions,
): AxisOptions | AxisOptions[] | undefined {
  const byId = options.canvas?.axes ?? {};
  const list = Array.isArray(axis) ? [...axis] : axis ? [axis] : [];
  // An address past the given axes (yAxis[1] with one y axis) adds it.
  for (const id of Object.keys(byId)) {
    const m = id.match(new RegExp(`^${kind}\\[(\\d+)\\]$`));
    if (m) while (list.length <= Number(m[1])) list.push({});
  }
  if (!list.length) return axis;
  const out = list.map((a, i) => {
    const over = byId[a.id ?? ""] ?? byId[`${kind}[${i}]`];
    const r = over ? merge({} as AxisOptions, a, over) : { ...a };
    const range = r.range;
    if (range?.mode === "fixed") {
      if (typeof range.start === "number" && r.min === undefined) r.min = range.start;
      if (typeof range.end === "number" && r.max === undefined) r.max = range.end;
    }
    if (range?.includeZero !== undefined && r.startOnZero === undefined) r.startOnZero = range.includeZero;
    return r;
  });
  return Array.isArray(axis) || out.length > 1 ? out : out[0];
}

/** Return the first axis configuration when an axis has multiple entries. */
export function firstAxis(
  axis?: AxisOptions | AxisOptions[],
): AxisOptions | undefined {
  return Array.isArray(axis) ? axis[0] : axis;
}

/** Return a configuration for a specific axis, defaulting absent axes to empty. */
export function axisAt(
  axis: AxisOptions | AxisOptions[] | undefined,
  index: number,
): AxisOptions {
  if (Array.isArray(axis)) return axis[index] ?? {};
  return index === 0 ? (axis ?? {}) : {};
}

/** Derive category labels from the x-axis or the union of point x values. */
export function resolveCategories(
  series: SeriesOptions[],
  xAxis?: AxisOptions | AxisOptions[],
): string[] | undefined {
  const axis = firstAxis(xAxis);
  if (axis?.categories) return axis.categories;
  if (axis?.type === "category") {
    const seen = new Set<string>();
    const categories: string[] = [];
    series.forEach((entry) =>
      entry.data.forEach((datum, index) => {
        const x = rawX(datum) ?? index;
        const key = String(x);
        if (!seen.has(key)) {
          seen.add(key);
          categories.push(key);
        }
      }),
    );
    return categories;
  }
  const allNumeric = series.every((entry) =>
    entry.data.every(
      (datum) =>
        typeof datum === "number" ||
        (Array.isArray(datum) && typeof datum[0] === "number"),
    ),
  );
  if (allNumeric) return undefined;
  // A linear axis places points at their numbers, given as points too.
  if (axis?.type === "linear" && series.every((entry) => entry.data.every((datum) => datum == null || typeof rawX(datum) === "number"))) return undefined;

  const seen = new Set<string>();
  const categories: string[] = [];
  for (const entry of series) {
    for (const datum of entry.data) {
      const x = rawX(datum);
      if (x !== undefined && !seen.has(String(x))) {
        seen.add(String(x));
        categories.push(String(x));
      }
    }
  }
  return categories.length ? categories : undefined;
}

function rawX(datum: unknown): string | number | undefined {
  if (datum === null) return undefined;
  if (Array.isArray(datum)) return datum[0] as string | number;
  if (typeof datum === "object") {
    const value = datum as { x?: string | number; name?: string };
    return value.x ?? value.name;
  }
  return undefined;
}
