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
  return merged;
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
  const allNumeric = series.every((entry) =>
    entry.data.every(
      (datum) =>
        typeof datum === "number" ||
        (Array.isArray(datum) && typeof datum[0] === "number"),
    ),
  );
  if (allNumeric) return undefined;

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
