/** Structured, side-effect-free validation for JavaScript and generated configs. */

import type {
  ChartOptions,
  ChartValidationIssue,
  ChartValidationResult,
} from "./options.js";
import { isSeriesTypeRegistered } from "../series/registry.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const describe = (value: unknown): string => {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
};

const numberAt = (record: UnknownRecord, key: string): number | undefined =>
  typeof record[key] === "number" ? record[key] : undefined;

const dataValues = (data: unknown[]): number[] => {
  const values: number[] = [];
  for (const point of data) {
    if (typeof point === "number") values.push(point);
    else if (Array.isArray(point)) {
      for (const value of point.slice(1))
        if (typeof value === "number") values.push(value);
    } else if (isRecord(point)) {
      for (const key of ["y", "low", "high", "value", "open", "close"])
        if (typeof point[key] === "number") values.push(point[key]);
    }
  }
  return values;
};

const pointX = (point: unknown, index: number): unknown => {
  if (Array.isArray(point)) return point[0];
  if (isRecord(point)) return point.x ?? point.name ?? index;
  return index;
};

const pointValue = (point: unknown): number | undefined => {
  if (typeof point === "number") return point;
  if (Array.isArray(point))
    return typeof point[1] === "number" ? point[1] : undefined;
  if (!isRecord(point)) return undefined;
  return typeof point.y === "number"
    ? point.y
    : typeof point.value === "number"
      ? point.value
      : undefined;
};

export class ChartValidationError extends Error {
  readonly issues: ChartValidationIssue[];

  constructor(issues: ChartValidationIssue[]) {
    super(
      `FacetViz configuration is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
    );
    this.name = "ChartValidationError";
    this.issues = issues;
  }
}

/** Validate an unknown value without rendering or mutating it. */
export function validateChartOptions(options: unknown): ChartValidationResult {
  const issues: ChartValidationIssue[] = [];
  const add = (
    code: string,
    severity: "error" | "warning",
    path: string,
    message: string,
    suggestion?: string,
  ) => issues.push({ code, severity, path, message, suggestion });

  if (!isRecord(options)) {
    add("config.object", "error", "$", "Configuration must be an object.");
    return result(issues);
  }

  const chart = options.chart;
  if (chart !== undefined && !isRecord(chart))
    add("chart.object", "error", "chart", "chart must be an object.");
  const chartRecord = isRecord(chart) ? chart : {};

  const validationOption = options.validation;
  if (
    validationOption !== undefined &&
    typeof validationOption !== "boolean" &&
    !isRecord(validationOption)
  )
    add("validation.object", "error", "validation", "validation must be a boolean or an options object.");
  if (isRecord(validationOption)) {
    if (
      validationOption.mode !== undefined &&
      !["warn", "error", "silent"].includes(String(validationOption.mode))
    )
      add("validation.mode", "error", "validation.mode", "Validation mode must be warn, error, or silent.");
    if (validationOption.onIssue !== undefined && typeof validationOption.onIssue !== "function")
      add("validation.on_issue.function", "error", "validation.onIssue", "onIssue must be a function.");
  }
  const globalType = chartRecord.type ?? "line";
  if (typeof globalType !== "string" || !isSeriesTypeRegistered(globalType))
    add(
      "chart.type.unknown",
      "error",
      "chart.type",
      `Unknown chart type ${describe(globalType)}.`,
      "Use a built-in type or call registerSeriesType() before validation.",
    );

  for (const dimension of ["width", "height"] as const) {
    const value = chartRecord[dimension];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0))
      add(
        `chart.${dimension}.positive`,
        "error",
        `chart.${dimension}`,
        `${dimension} must be a positive finite number.`,
      );
  }
  const polarInnerSize = chartRecord.polarInnerSize;
  if (
    polarInnerSize !== undefined &&
    !(
      (typeof polarInnerSize === "number" &&
        Number.isFinite(polarInnerSize) &&
        polarInnerSize >= 0) ||
      (typeof polarInnerSize === "string" &&
        /^\s*(?:\d+(?:\.\d+)?|\.\d+)%\s*$/.test(polarInnerSize) &&
        parseFloat(polarInnerSize) >= 0 &&
        parseFloat(polarInnerSize) < 100)
    )
  )
    add(
      "chart.polar_inner_size.valid",
      "error",
      "chart.polarInnerSize",
      "polarInnerSize must be a non-negative pixel number or a percentage below 100%.",
    );
  if (
    chartRecord.polarGridLineMode !== undefined &&
    !["spoke", "sector"].includes(String(chartRecord.polarGridLineMode))
  )
    add(
      "chart.polar_grid_line_mode.unknown",
      "error",
      "chart.polarGridLineMode",
      "polarGridLineMode must be spoke or sector.",
    );

  validateTitle(options.title, "title", add);
  validateTitle(options.subtitle, "subtitle", add);
  validateAnnotations(options.annotations, add);
  validateResponsive(options.responsive, add);

  for (const [path, palette] of [
    ["colors", options.colors],
    ["chart.colors", chartRecord.colors],
  ] as const) {
    if (palette !== undefined && (!Array.isArray(palette) || palette.length === 0))
      add("colors.non_empty", "error", path, "A color palette must be a non-empty array.");
    else if (Array.isArray(palette) && palette.some((color) => typeof color !== "string" || color.trim() === ""))
      add("colors.string", "error", path, "Every palette entry must be a non-empty color string.");
  }

  const xAxes = validateAxes(options.xAxis, "xAxis", add);
  const yAxes = validateAxes(options.yAxis, "yAxis", add);
  const series = options.series;
  if (!Array.isArray(series)) {
    add("series.required", "error", "series", "series must be an array.");
    return result(issues);
  }
  if (series.length === 0)
    add("series.empty", "warning", "series", "The chart has no series to render.");

  const drilldownIds = new Set<string>();
  const drilldown = options.drilldown;
  if (drilldown !== undefined && (!isRecord(drilldown) || !Array.isArray(drilldown.series)))
    add("drilldown.series.required", "error", "drilldown.series", "drilldown.series must be an array.");
  const drillSeries = isRecord(drilldown) && Array.isArray(drilldown.series)
    ? drilldown.series
    : [];
  drillSeries.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "")
      add("drilldown.id.required", "error", `drilldown.series[${index}].id`, "Drilldown series require a non-empty id.");
    else if (drilldownIds.has(entry.id))
      add("drilldown.id.duplicate", "error", `drilldown.series[${index}].id`, `Duplicate drilldown id ${describe(entry.id)}.`);
    else drilldownIds.add(entry.id);
  });

  series.forEach((entry, seriesIndex) => {
    const base = `series[${seriesIndex}]`;
    if (!isRecord(entry)) {
      add("series.object", "error", base, "Each series must be an object.");
      return;
    }
    const type = entry.type ?? globalType;
    if (typeof type !== "string" || !isSeriesTypeRegistered(type)) {
      add(
        "series.type.unknown",
        "error",
        `${base}.type`,
        `Unknown series type ${describe(type)}.`,
        "Use a built-in type or register the custom type first.",
      );
      return;
    }
    if (
      chartRecord.polar === true &&
      !["line", "spline", "step", "area", "areaspline", "scatter", "jitter", "column"].includes(
        String(type),
      )
    )
      add(
        "chart.polar.series.unsupported",
        "warning",
        `${base}.type`,
        `${type} does not support chart.polar and will not be rendered in the polar frame.`,
        "Use line, spline, step, area, areaspline, scatter, jitter, or column.",
      );
    const data = entry.data;
    if (!Array.isArray(data)) {
      add("series.data.required", "error", `${base}.data`, "Series data must be an array.");
      return;
    }
    if (data.length === 0)
      add("series.data.empty", "warning", `${base}.data`, "This series has no data points.");

    const yAxisIndex = entry.yAxis ?? 0;
    const validYAxisIndex =
      typeof yAxisIndex === "number" &&
      Number.isInteger(yAxisIndex) &&
      yAxisIndex >= 0 &&
      yAxisIndex <= 1 &&
      yAxisIndex < yAxes.length;
    if (!validYAxisIndex)
      add("series.y_axis.index", "error", `${base}.yAxis`, `yAxis index must reference one of ${yAxes.length} configured axes.`);

    const yAxis = yAxes[validYAxisIndex ? yAxisIndex : 0] ?? {};
    if (yAxis.type === "log" && dataValues(data).some((value) => value <= 0))
      add("axis.log.non_positive", "error", `${base}.data`, "Logarithmic axes require strictly positive values.");
    const xAxisIndex = entry.xAxis ?? 0;
    const validXAxisIndex =
      typeof xAxisIndex === "number" &&
      Number.isInteger(xAxisIndex) &&
      xAxisIndex >= 0 &&
      xAxisIndex <= 1 &&
      xAxisIndex < xAxes.length;
    if (!validXAxisIndex)
      add("series.x_axis.index", "error", `${base}.xAxis`, `xAxis index must reference one of ${xAxes.length} configured axes.`);
    const xAxis = xAxes[validXAxisIndex ? xAxisIndex : 0] ?? {};
    if (xAxis.type === "log" && data.some((point, index) => {
      const x = pointX(point, index);
      return typeof x === "number" && x <= 0;
    }))
      add("axis.log.non_positive_x", "error", `${base}.data`, "Logarithmic x-axes require strictly positive x values.");

    if (type === "histogram" && entry.bins !== undefined && (typeof entry.bins !== "number" || !Number.isSafeInteger(entry.bins) || entry.bins <= 0))
      add("histogram.bins.positive_integer", "error", `${base}.bins`, "Histogram bins must be a positive integer.");

    if (["pie", "donut", "funnel", "radialbar", "sunburst"].includes(type)) {
      if (data.some((point) => (pointValue(point) ?? 1) < 0))
        add("series.value.non_negative", "error", `${base}.data`, `${type} values cannot be negative.`);
    }

    if (["arearange", "areasplinerange", "columnrange", "errorbar"].includes(type))
      validateRanges(data, base, add);
    if (type === "boxplot") validateBoxplots(data, base, add);
    if (type === "candlestick") validateCandlesticks(data, base, add);
    if (type === "gantt") validateGantt(data, base, add);
    if (type === "sankey") validateSankey(data, base, add);
    if (type === "treegraph" || type === "sunburst") validateHierarchy(data, base, add);

    if (type === "gauge") {
      const min = numberAt(entry, "min") ?? 0;
      const max = numberAt(entry, "max") ?? 100;
      if (min >= max)
        add("gauge.range.order", "error", base, "Gauge min must be smaller than max.");
      const value = pointValue(data[0]);
      if (value !== undefined && (value < min || value > max))
        add("gauge.value.outside_range", "warning", `${base}.data[0]`, `Gauge value ${value} is outside ${min}–${max} and will be clamped.`);
    }

    data.forEach((point, pointIndex) => {
      if (isRecord(point) && typeof point.drilldown === "string" && !drilldownIds.has(point.drilldown))
        add("drilldown.reference.missing", "warning", `${base}.data[${pointIndex}].drilldown`, `No drilldown series has id ${describe(point.drilldown)}.`);
    });
  });

  return result(issues);
}

function result(issues: ChartValidationIssue[]): ChartValidationResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings, issues };
}

type AddIssue = (
  code: string,
  severity: "error" | "warning",
  path: string,
  message: string,
  suggestion?: string,
) => void;

function validateAxes(value: unknown, path: string, add: AddIssue): UnknownRecord[] {
  const axes = Array.isArray(value) ? value : [value ?? {}];
  if (axes.length > 2)
    add(
      "axis.count.maximum",
      "error",
      path,
      "FacetViz supports at most two axes per direction.",
      "Keep a primary axis at index 0 and an optional secondary axis at index 1.",
    );
  return axes.map((axis, index) => {
    const axisPath = Array.isArray(value) ? `${path}[${index}]` : path;
    if (!isRecord(axis)) {
      add("axis.object", "error", axisPath, "Axis configuration must be an object.");
      return {};
    }
    if (axis.min !== undefined && typeof axis.min !== "number")
      add("axis.min.number", "error", `${axisPath}.min`, "Axis min must be a number.");
    if (axis.max !== undefined && typeof axis.max !== "number")
      add("axis.max.number", "error", `${axisPath}.max`, "Axis max must be a number.");
    if (typeof axis.min === "number" && typeof axis.max === "number" && axis.min >= axis.max)
      add("axis.range.order", "error", axisPath, "Axis min must be smaller than max.");
    if (axis.type !== undefined && !["linear", "log", "category", "datetime"].includes(String(axis.type)))
      add("axis.type.unknown", "error", `${axisPath}.type`, `Unknown axis type ${describe(axis.type)}.`);
    validateTitle(axis.title, `${axisPath}.title`, add, true);
    if (isRecord(axis.labels)) {
      if (
        axis.labels.position !== undefined &&
        !["outer", "inner"].includes(String(axis.labels.position))
      )
        add(
          "axis.labels.position.unknown",
          "error",
          `${axisPath}.labels.position`,
          "Polar label position must be outer or inner.",
        );
      if (
        axis.labels.offset !== undefined &&
        (typeof axis.labels.offset !== "number" ||
          !Number.isFinite(axis.labels.offset) ||
          axis.labels.offset < 0)
      )
        add(
          "axis.labels.offset.non_negative",
          "error",
          `${axisPath}.labels.offset`,
          "Polar label offset must be a non-negative number.",
        );
      if (
        axis.labels.step !== undefined &&
        (typeof axis.labels.step !== "number" ||
          !Number.isSafeInteger(axis.labels.step) ||
          axis.labels.step <= 0)
      )
        add(
          "axis.labels.step.positive_integer",
          "error",
          `${axisPath}.labels.step`,
          "Label step must be a positive integer.",
        );
      if (
        axis.labels.maxWidth !== undefined &&
        (typeof axis.labels.maxWidth !== "number" || axis.labels.maxWidth <= 0)
      )
        add(
          "axis.labels.max_width.positive",
          "error",
          `${axisPath}.labels.maxWidth`,
          "Label maxWidth must be a positive number.",
        );
      if (
        axis.labels.autoRotation !== undefined &&
        (!Array.isArray(axis.labels.autoRotation) ||
          axis.labels.autoRotation.some((value) => typeof value !== "number"))
      )
        add(
          "axis.labels.auto_rotation.numbers",
          "error",
          `${axisPath}.labels.autoRotation`,
          "autoRotation must be an array of numeric angles.",
        );
    }
    return axis;
  });
}

function validateTitle(
  value: unknown,
  path: string,
  add: AddIssue,
  axis = false,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add("title.object", "error", path, "Title configuration must be an object.");
    return;
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    add("title.enabled.boolean", "error", `${path}.enabled`, "enabled must be a boolean.");
  if (
    axis &&
    value.position !== undefined &&
    !["outer", "center"].includes(String(value.position))
  )
    add(
      "axis.title.position.unknown",
      "error",
      `${path}.position`,
      "Polar axis-title position must be outer or center.",
    );
  for (const key of axis ? ["margin", "offset"] : ["margin", "offsetY"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item)))
      add("title.offset.number", "error", `${path}.${key}`, `${key} must be a finite number.`);
    else if (key === "margin" && typeof item === "number" && item < 0)
      add(
        "title.margin.non_negative",
        "error",
        `${path}.${key}`,
        "margin must be non-negative.",
      );
  }
}

function validateAnnotations(value: unknown, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add("annotations.array", "error", "annotations", "annotations must be an array.");
    return;
  }
  value.forEach((annotation, index) => {
    const path = `annotations[${index}]`;
    if (!isRecord(annotation)) {
      add("annotation.object", "error", path, "Each annotation must be an object.");
      return;
    }
    if (
      annotation.shape !== undefined &&
      !["label", "callout", "circle"].includes(String(annotation.shape))
    )
      add("annotation.shape.unknown", "error", `${path}.shape`, "Unknown annotation shape.");
    if (
      annotation.x !== undefined &&
      typeof annotation.x !== "number" &&
      typeof annotation.x !== "string"
    )
      add("annotation.x.value", "error", `${path}.x`, "Annotation x must be a number or string.");
    if (annotation.y !== undefined && typeof annotation.y !== "number")
      add("annotation.y.number", "error", `${path}.y`, "Annotation y must be a number.");
    for (const axis of ["xAxis", "yAxis"] as const)
      if (
        annotation[axis] !== undefined &&
        annotation[axis] !== 0 &&
        annotation[axis] !== 1
      )
        add(
          "annotation.axis.index",
          "error",
          `${path}.${axis}`,
          `${axis} must be 0 or 1.`,
        );
  });
}

function validateResponsive(value: unknown, add: AddIssue): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add("responsive.array", "error", "responsive", "responsive must be an array.");
    return;
  }
  value.forEach((rule, index) => {
    const path = `responsive[${index}]`;
    if (!isRecord(rule)) {
      add("responsive.rule.object", "error", path, "Each responsive rule must be an object.");
      return;
    }
    if (!isRecord(rule.condition))
      add(
        "responsive.condition.object",
        "error",
        `${path}.condition`,
        "Responsive rules require a condition object.",
      );
    if (!isRecord(rule.options))
      add(
        "responsive.options.object",
        "error",
        `${path}.options`,
        "Responsive rules require an options object.",
      );
    if (isRecord(rule.condition)) {
      for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
        const limit = rule.condition[key];
        if (
          limit !== undefined &&
          (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0)
        )
          add(
            "responsive.condition.non_negative",
            "error",
            `${path}.condition.${key}`,
            `${key} must be a non-negative finite number.`,
          );
      }
    }
  });
}

function validateRanges(data: unknown[], base: string, add: AddIssue): void {
  data.forEach((point, index) => {
    const low = Array.isArray(point) ? point[1] : isRecord(point) ? point.low : undefined;
    const high = Array.isArray(point) ? point[2] : isRecord(point) ? point.high : undefined;
    if (typeof low !== "number" || typeof high !== "number")
      add("range.low_high.required", "error", `${base}.data[${index}]`, "Range points require numeric low and high values.");
    else if (low > high)
      add("range.order", "error", `${base}.data[${index}]`, "Range point low cannot exceed high.");
  });
}

function validateBoxplots(data: unknown[], base: string, add: AddIssue): void {
  data.forEach((point, index) => {
    if (!isRecord(point)) {
      add("boxplot.shape", "error", `${base}.data[${index}]`, "Boxplot points require min, q1, median, q3, and max.");
      return;
    }
    const values = [point.min, point.q1, point.median, point.q3, point.max];
    if (!values.every((value) => typeof value === "number"))
      add("boxplot.shape", "error", `${base}.data[${index}]`, "Boxplot points require numeric min, q1, median, q3, and max.");
    else if (values.some((value, i) => i > 0 && Number(values[i - 1]) > Number(value)))
      add("boxplot.order", "error", `${base}.data[${index}]`, "Boxplot values must satisfy min ≤ q1 ≤ median ≤ q3 ≤ max.");
  });
}

function validateCandlesticks(data: unknown[], base: string, add: AddIssue): void {
  data.forEach((point, index) => {
    if (!isRecord(point)) {
      add("candlestick.shape", "error", `${base}.data[${index}]`, "Candlestick points require open, high, low, and close.");
      return;
    }
    const values = [point.open, point.high, point.low, point.close];
    if (!values.every((value) => typeof value === "number"))
      add("candlestick.shape", "error", `${base}.data[${index}]`, "Candlestick points require numeric open, high, low, and close.");
    else if (Number(point.high) < Math.max(Number(point.open), Number(point.close), Number(point.low)) || Number(point.low) > Math.min(Number(point.open), Number(point.close), Number(point.high)))
      add("candlestick.order", "error", `${base}.data[${index}]`, "high must be the largest OHLC value and low the smallest.");
  });
}

function validateGantt(data: unknown[], base: string, add: AddIssue): void {
  data.forEach((point, index) => {
    if (!isRecord(point) || typeof point.start !== "number" || typeof point.end !== "number")
      add("gantt.start_end.required", "error", `${base}.data[${index}]`, "Gantt points require numeric start and end values.");
    else if (point.end <= point.start)
      add("gantt.range.order", "error", `${base}.data[${index}]`, "Gantt end must be greater than start.");
  });
}

function validateSankey(data: unknown[], base: string, add: AddIssue): void {
  const edges: Array<[string, string]> = [];
  data.forEach((point, index) => {
    if (!isRecord(point) || typeof point.from !== "string" || !point.from || typeof point.to !== "string" || !point.to)
      add("sankey.link.required", "error", `${base}.data[${index}]`, "Sankey links require non-empty from and to ids.");
    else {
      edges.push([point.from, point.to]);
      const weight = point.weight ?? point.y ?? 1;
      if (typeof weight !== "number" || weight <= 0)
        add("sankey.weight.positive", "error", `${base}.data[${index}].weight`, "Sankey link weight must be positive.");
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const graph = new Map<string, string[]>();
  for (const [from, to] of edges) graph.set(from, [...(graph.get(from) ?? []), to]);
  const cyclic = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (cyclic(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  if ([...graph.keys()].some(cyclic))
    add("sankey.cycle", "error", `${base}.data`, "Sankey links must form an acyclic graph.");
}

function validateHierarchy(data: unknown[], base: string, add: AddIssue): void {
  const ids = new Set<string>();
  data.forEach((point, index) => {
    if (!isRecord(point)) return;
    const id = point.id ?? point.name;
    if (id === undefined) return;
    const key = String(id);
    if (ids.has(key))
      add("hierarchy.id.duplicate", "error", `${base}.data[${index}].id`, `Duplicate hierarchy id ${JSON.stringify(key)}.`);
    ids.add(key);
  });
  data.forEach((point, index) => {
    if (isRecord(point) && point.parent !== undefined && !ids.has(String(point.parent)))
      add("hierarchy.parent.missing", "warning", `${base}.data[${index}].parent`, `Parent ${JSON.stringify(String(point.parent))} does not exist and this node will become a root.`);
  });
}

/** Apply the opt-in validation policy used by constructor/update APIs. */
export function enforceConfiguredValidation(options: ChartOptions): void {
  const configured = options.validation;
  if (!configured) return;
  const validation = validateChartOptions(options);
  const config = configured === true ? {} : configured;
  for (const issue of validation.issues) config.onIssue?.(issue);
  const mode = ["warn", "error", "silent"].includes(config.mode ?? "")
    ? config.mode
    : "warn";
  if (mode === "error" && validation.errors.length)
    throw new ChartValidationError(validation.errors);
  if (mode === "warn") {
    for (const issue of validation.issues)
      console.warn(`[FacetViz:${issue.code}] ${issue.path}: ${issue.message}`);
  }
}
