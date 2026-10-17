/**
 * Dashboard metric card with an optional comparison and compact FacetViz chart.
 *
 * The card is HTML so its text remains selectable and accessible. Its optional
 * visual is a regular FacetViz instance, which means every registered series
 * type and chart interaction remains available inside the card.
 */

import type { ChartOptions } from "./options.js";
import type { ThemeInput } from "./theme.js";
import { FacetViz } from "./chart.js";
import { resolveTheme } from "./theme.js";
import { formatValue, merge } from "./utils.js";
import {
  applyStyle, clamp01, finite, formatCardValue, renderCardRows, resolveChange, toneColor, colorMix,
  type CardAccentOptions, type CardComparisonContext, type CardRow, type CardStyle, type CardTone, type CardValue,
  type CardValueContext, type ResolvedChange,
} from "./cardItems.js";

export type {
  CardAccentOptions, CardBadgeItem, CardBand, CardBarItem, CardChangeItem, CardChartItem, CardComparisonContext,
  CardDividerItem, CardIconItem, CardImageItem, CardItem, CardItemPin, CardRingItem, CardRow, CardSpacerItem, CardStackItem,
  CardStyle, CardTextItem, CardTextSpan, CardTone, CardValue, CardValueContext, CardValueItem,
} from "./cardItems.js";

export interface CardTitleOptions {
  text: string;
  /** Smaller line directly below the title. */
  subtitle?: string;
}

export interface CardComparisonOptions {
  /** Reference measure. Difference and percentage are derived when possible. */
  previousValue?: number;
  /** Explicit absolute change. Overrides the difference derived from `previousValue`. */
  difference?: number;
  /** Explicit ratio (0.125 = 12.5%). Overrides the derived percentage. */
  percentChange?: number;
  /** Which analysis to print. Default `percent`. */
  display?: "difference" | "percent" | "both";
  /** Context such as "vs last month". */
  label?: string;
  /** Number format for the absolute difference. Defaults to the card value format. */
  format?: string;
  /** Number format for the ratio. Default `.1%`. */
  percentFormat?: string;
  /** Whether an increase or decrease is good. Default `increase`. */
  favorableDirection?: "increase" | "decrease" | "neutral";
  /** Show a directional arrow before the analysis. Default `true`. */
  showIcon?: boolean;
  /** `split` places current and previous measures side-by-side. */
  layout?: "inline" | "split";
  currentLabel?: string;
  previousLabel?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  formatter?: (context: CardComparisonContext) => string;
}

export interface CardProgressOptions {
  /** Goal value used as 100%. */
  target: number;
  /** Progress value. Defaults to the card's numeric `value`. */
  value?: number;
  label?: string;
  targetLabel?: string;
  format?: string;
  color?: string;
  trackColor?: string;
}

export interface CardBreakdownItem {
  label: string;
  value: CardValue;
  format?: string;
  color?: string;
}

export interface CardBreakdownOptions {
  items: CardBreakdownItem[];
}

export interface CardGoalOptions {
  target: number;
  /** Current goal value. Defaults to the card's numeric `value`. */
  current?: number;
  label?: string;
  format?: string;
  color?: string;
  trackColor?: string;
}

export interface CardStatusOptions {
  text: string;
  detail?: string;
  tone?: CardTone;
  color?: string;
  backgroundColor?: string;
}

export interface CardRangeOptions {
  min: number;
  max: number;
  /** Marker value. Defaults to the card's numeric `value`. */
  value?: number;
  /** Optional target marker. */
  target?: number;
  minLabel?: string;
  maxLabel?: string;
  targetLabel?: string;
  format?: string;
}

export interface CardForecastOptions {
  /** Central forecast/trend values. */
  data: Array<number | [number | string, number]>;
  /** Optional `[x, low, high]` confidence interval. */
  range?: Array<[number | string, number, number]>;
  label?: string;
  rangeLabel?: string;
  color?: string;
  height?: number;
}

export interface CardContextOptions {
  min: number;
  average: number;
  max: number;
  message?: string;
  format?: string;
  minLabel?: string;
  averageLabel?: string;
  maxLabel?: string;
}

export interface CardSummaryItem {
  label: string;
  value: CardValue;
  tone?: CardTone;
  color?: string;
}

export interface CardSummaryOptions {
  items: CardSummaryItem[];
}

export interface CardStyleOptions {
  root?: CardStyle;
  body?: CardStyle;
  content?: CardStyle;
  title?: CardStyle;
  subtitle?: CardStyle;
  value?: CardStyle;
  comparison?: CardStyle;
  comparisonLabel?: CardStyle;
  status?: CardStyle;
  progress?: CardStyle;
  breakdown?: CardStyle;
  goal?: CardStyle;
  range?: CardStyle;
  context?: CardStyle;
  summary?: CardStyle;
  chart?: CardStyle;
  footer?: CardStyle;
}

export interface CardAccessibilityOptions {
  enabled?: boolean;
  /** Overrides the generated title/value/comparison label. */
  description?: string;
}

export interface FacetCardOptions {
  title?: string | CardTitleOptions;
  /** Primary measure; unused when the card is laid out by `rows`. */
  value?: CardValue;
  /** FacetViz number format, e.g. `$,.1s`, `,.0f`, or `.1%`. */
  format?: string;
  valueFormatter?: (context: CardValueContext) => string;
  /** Optional short label below the primary measure. */
  label?: string;
  comparison?: CardComparisonOptions | false;
  /** Linear progress toward a target. */
  progress?: CardProgressOptions | false;
  /** Small contribution/category values below the primary measure. */
  breakdown?: CardBreakdownOptions | false;
  /** Radial progress toward a goal. */
  goal?: CardGoalOptions | false;
  /** Full-width health/threshold state band. */
  status?: CardStatusOptions | false;
  /** Marker on a min/max scale with an optional target. */
  range?: CardRangeOptions | false;
  /** Compact forecast line with an optional confidence interval. */
  forecast?: CardForecastOptions | false;
  /** Min/average/max values providing context for the measure. */
  context?: CardContextOptions | false;
  /** Operational or component status rows. */
  summary?: CardSummaryOptions | false;
  /** Any FacetViz chart. Card-friendly chrome defaults are applied underneath it. */
  chart?: ChartOptions | false;
  /** Place the chart below or beside the metric content. Default `vertical`. */
  layout?: "vertical" | "horizontal";
  /** Default embedded-chart height when `chart.chart.height` is not supplied. */
  chartHeight?: number;
  footer?: string;
  /** Lay the card out freely: rows of text, values, changes, charts, bars,
   * rings, badges, icons and images. Replaces the title, value and the
   * blocks above; `status`, `style.root`, `theme` and `accessibility` still apply. */
  rows?: CardRow[];
  /** Where rows sit when the card is taller than they are. Default `start`. */
  rowsAlign?: "start" | "center" | "end" | "between";
  /** px between rows. Default 6. */
  rowGap?: number;
  /** A colored bar along one side of the card. */
  accent?: CardAccentOptions | false;
  className?: string;
  theme?: ThemeInput;
  style?: CardStyleOptions;
  accessibility?: CardAccessibilityOptions;
}

type ResolvedComparison = ResolvedChange;

/** A title/value KPI card, optionally enriched by change analysis and a chart. */
export class FacetCard {
  readonly container: HTMLElement;
  private options: FacetCardOptions;
  private root?: HTMLDivElement;
  private chart?: FacetViz;
  /** Charts inside `rows`. */
  private itemCharts: FacetViz[] = [];
  private destroyed = false;

  constructor(container: HTMLElement | string, options: FacetCardOptions) {
    const element =
      typeof container === "string" ? document.querySelector(container) : container;
    if (!element) throw new Error("FacetCard: container element not found");
    this.container = element as HTMLElement;
    this.options = merge({} as FacetCardOptions, options);
    this.render();
  }

  /** Merge card options and rebuild its content and optional chart. */
  update(options: Partial<FacetCardOptions>): void {
    if (this.destroyed) return;
    this.options = merge(this.options, options);
    this.render();
  }

  /** Update the primary measure without replacing the rest of the card options. */
  setValue(value: CardValue): void {
    this.update({ value });
  }

  /** Re-measure the embedded chart after an outer layout change. */
  reflow(): void {
    if (this.destroyed) return;
    this.chart?.reflow();
    this.itemCharts.forEach((c) => c.reflow());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.chart?.destroy();
    this.chart = undefined;
    this.itemCharts.forEach((c) => c.destroy());
    this.itemCharts = [];
    this.root?.remove();
    this.root = undefined;
  }

  private render(): void {
    this.chart?.destroy();
    this.chart = undefined;
    this.itemCharts.forEach((c) => c.destroy());
    this.itemCharts = [];

    const theme = resolveTheme(this.options.theme);
    const horizontal = this.options.layout === "horizontal";
    const root = document.createElement("div");
    root.className = ["facet-card", `facet-card-${horizontal ? "horizontal" : "vertical"}`, this.options.className]
      .filter(Boolean)
      .join(" ");
    root.style.boxSizing = "border-box";
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.alignItems = "stretch";
    root.style.gap = "16px";
    root.style.width = "100%";
    root.style.minWidth = "0";
    root.style.padding = "20px";
    root.style.border = `1px solid ${theme.axis.lineColor}`;
    root.style.borderRadius = "12px";
    root.style.background = theme.backgroundColor;
    root.style.color = theme.title.color;
    root.style.fontFamily = theme.fontFamily;
    applyStyle(root, this.options.style?.root);

    if (this.options.status)
      root.appendChild(this.renderStatus(this.options.status, theme));

    if (this.options.accent) {
      const { color, side = "left", width = 4 } = this.options.accent;
      const [x, y] = side === "left" ? [width, 0] : side === "right" ? [-width, 0] : side === "top" ? [0, width] : [0, -width];
      // An inset shadow follows the rounded corners and needs no clipping,
      // so tooltips of charts inside can still overflow the card.
      root.style.boxShadow = [`inset ${x}px ${y}px 0 0 ${color}`, root.style.boxShadow].filter(Boolean).join(", ");
    }

    if (this.options.rows) {
      this.renderRows(root, this.options.rows, theme);
      return;
    }

    const body = document.createElement("div");
    body.className = "facet-card-body";
    body.style.display = "flex";
    body.style.flex = "1 1 auto";
    body.style.flexDirection = horizontal ? "row" : "column";
    body.style.alignItems = "stretch";
    body.style.gap = "16px";
    body.style.minWidth = "0";
    applyStyle(body, this.options.style?.body);

    const content = document.createElement("div");
    content.className = "facet-card-content";
    content.style.display = "flex";
    content.style.flex = horizontal ? "1 1 55%" : "0 0 auto";
    content.style.flexDirection = "column";
    content.style.justifyContent = "center";
    content.style.minWidth = "0";
    applyStyle(content, this.options.style?.content);

    const title = titleOptions(this.options.title);
    if (title?.text) {
      const heading = document.createElement("div");
      heading.className = "facet-card-title";
      heading.textContent = title.text;
      heading.style.color = theme.title.color;
      heading.style.fontSize = "14px";
      heading.style.fontWeight = "600";
      heading.style.lineHeight = "1.35";
      applyStyle(heading, this.options.style?.title);
      content.appendChild(heading);
    }
    if (title?.subtitle) {
      const subtitle = document.createElement("div");
      subtitle.className = "facet-card-subtitle";
      subtitle.textContent = title.subtitle;
      subtitle.style.marginTop = "2px";
      subtitle.style.color = theme.subtitle.color;
      subtitle.style.fontSize = "12px";
      subtitle.style.lineHeight = "1.4";
      applyStyle(subtitle, this.options.style?.subtitle);
      content.appendChild(subtitle);
    }

    const formattedValue = this.formattedValue();
    const comparison = this.resolveComparison();
    if (this.options.goal) {
      content.appendChild(this.renderGoal(this.options.goal, theme));
    } else if (comparison && this.options.comparison &&
      this.options.comparison.layout === "split" &&
      finite(this.options.comparison.previousValue) !== undefined) {
      content.appendChild(
        this.renderSplitComparison(this.options.comparison, comparison, formattedValue, theme),
      );
    } else {
      content.appendChild(this.renderValue(formattedValue, !!(title?.text || title?.subtitle), theme));
      if (this.options.label)
        content.appendChild(this.renderMutedText("facet-card-label", this.options.label, theme, 4));
      if (comparison) content.appendChild(this.renderComparison(comparison));
    }

    if (this.options.progress)
      content.appendChild(this.renderProgress(this.options.progress, theme));
    if (this.options.breakdown)
      content.appendChild(this.renderBreakdown(this.options.breakdown, theme));
    if (this.options.range)
      content.appendChild(this.renderRange(this.options.range, theme));
    if (this.options.context)
      content.appendChild(this.renderContext(this.options.context, theme));
    if (this.options.summary)
      content.appendChild(this.renderSummary(this.options.summary, theme));

    if (this.options.footer) {
      const footer = document.createElement("div");
      footer.className = "facet-card-footer";
      footer.textContent = this.options.footer;
      footer.style.marginTop = "12px";
      footer.style.color = theme.subtitle.color;
      footer.style.fontSize = "11px";
      footer.style.lineHeight = "1.4";
      applyStyle(footer, this.options.style?.footer);
      content.appendChild(footer);
    }

    body.appendChild(content);
    let chartHost: HTMLDivElement | undefined;
    const forecast = this.options.forecast || undefined;
    const visualOptions = forecast
      ? this.forecastChartOptions(forecast)
      : this.options.chart || undefined;
    if (visualOptions) {
      const visual = document.createElement("div");
      visual.className = forecast
        ? "facet-card-visual facet-card-forecast"
        : "facet-card-visual";
      visual.style.display = "flex";
      visual.style.flex = horizontal ? "1 1 45%" : "0 0 auto";
      visual.style.flexDirection = "column";
      visual.style.minWidth = "0";
      visual.style.alignSelf = "stretch";
      if (forecast?.label) {
        const forecastHeader = document.createElement("div");
        forecastHeader.className = "facet-card-forecast-label";
        forecastHeader.textContent = forecast.label;
        forecastHeader.style.color = theme.subtitle.color;
        forecastHeader.style.fontSize = "11px";
        forecastHeader.style.marginBottom = "4px";
        visual.appendChild(forecastHeader);
      }
      chartHost = document.createElement("div");
      chartHost.className = "facet-card-chart";
      chartHost.style.flex = "0 0 auto";
      chartHost.style.minWidth = "0";
      chartHost.style.alignSelf = "stretch";
      const chartHeight = visualOptions.chart?.height ?? forecast?.height ??
        this.options.chartHeight ?? (horizontal ? 120 : 76);
      chartHost.style.height = `${chartHeight}px`;
      applyStyle(chartHost, this.options.style?.chart);
      visual.appendChild(chartHost);
      if (forecast?.rangeLabel) {
        const forecastRange = document.createElement("div");
        forecastRange.className = "facet-card-forecast-range";
        forecastRange.textContent = forecast.rangeLabel;
        forecastRange.style.color = theme.subtitle.color;
        forecastRange.style.fontSize = "11px";
        forecastRange.style.marginTop = "4px";
        forecastRange.style.textAlign = "right";
        visual.appendChild(forecastRange);
      }
      body.appendChild(visual);
    }

    root.appendChild(body);

    this.applyAccessibility(root, title?.text, formattedValue, comparison);
    this.container.replaceChildren(root);
    this.root = root;

    if (chartHost && visualOptions) {
      this.chart = new FacetViz(chartHost, this.chartOptions(visualOptions));
    }
  }

  private renderRows(root: HTMLDivElement, rows: CardRow[], theme: ReturnType<typeof resolveTheme>): void {
    const laid = renderCardRows(rows, theme, this.options.rowsAlign, this.options.rowGap);
    // Items may size themselves to the card's width (`cqi` units).
    root.style.containerType = "inline-size";
    if (laid.pinned.length) root.style.position = "relative";
    root.appendChild(laid.element);
    root.append(...laid.pinned);
    if (this.options.accessibility?.enabled !== false) {
      root.setAttribute("role", "group");
      root.setAttribute(
        "aria-label",
        this.options.accessibility?.description ?? (laid.text.filter(Boolean).join(", ") || "Metric card"),
      );
    }
    this.container.replaceChildren(root);
    this.root = root;
    this.itemCharts = laid.charts.map(({ host, item }) => {
      const options = this.chartOptions(item.chart);
      options.chart = { ...options.chart, height: item.chart.chart?.height ?? item.height ?? 40 };
      return new FacetViz(host, options);
    });
  }

  private renderValue(formatted: string, hasTitle: boolean, theme: ReturnType<typeof resolveTheme>): HTMLDivElement {
    const value = document.createElement("div");
    value.className = "facet-card-value";
    value.textContent = formatted;
    value.style.marginTop = hasTitle ? "10px" : "0";
    value.style.color = theme.title.color;
    value.style.fontSize = "32px";
    value.style.fontWeight = "700";
    value.style.letterSpacing = "-0.025em";
    value.style.lineHeight = "1.1";
    value.style.overflowWrap = "anywhere";
    applyStyle(value, this.options.style?.value);
    return value;
  }

  private renderMutedText(
    className: string,
    text: string,
    theme: ReturnType<typeof resolveTheme>,
    marginTop = 0,
  ): HTMLDivElement {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    element.style.marginTop = `${marginTop}px`;
    element.style.color = theme.subtitle.color;
    element.style.fontSize = "12px";
    element.style.lineHeight = "1.35";
    return element;
  }

  private renderStatus(
    options: CardStatusOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const status = document.createElement("div");
    status.className = `facet-card-status facet-card-status-${options.tone ?? "neutral"}`;
    status.style.display = "flex";
    status.style.alignItems = "baseline";
    status.style.justifyContent = "space-between";
    status.style.gap = "8px";
    status.style.padding = "10px 12px";
    status.style.borderRadius = "8px";
    status.style.fontSize = "12px";
    status.style.fontWeight = "600";
    const color = options.color ?? toneColor(options.tone ?? "neutral", theme);
    status.style.color = color;
    status.style.background = options.backgroundColor ?? colorMix(color, theme.backgroundColor, 14);
    const text = document.createElement("span");
    text.textContent = options.text;
    status.appendChild(text);
    if (options.detail) {
      const detail = document.createElement("span");
      detail.textContent = options.detail;
      detail.style.fontWeight = "400";
      status.appendChild(detail);
    }
    applyStyle(status, this.options.style?.status);
    return status;
  }

  private renderProgress(
    options: CardProgressOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const current = finite(options.value) ?? numericCardValue(this.options.value) ?? 0;
    const ratio = options.target === 0 ? 0 : clamp01(current / options.target);
    const wrapper = document.createElement("div");
    wrapper.className = "facet-card-progress";
    wrapper.style.marginTop = "14px";
    const track = document.createElement("div");
    track.className = "facet-card-progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(options.target));
    track.setAttribute("aria-valuenow", String(current));
    track.style.height = "8px";
    track.style.overflow = "hidden";
    track.style.borderRadius = "999px";
    track.style.background = options.trackColor ?? theme.axis.gridLineColor;
    const fill = document.createElement("div");
    fill.className = "facet-card-progress-value";
    fill.style.width = `${ratio * 100}%`;
    fill.style.height = "100%";
    fill.style.borderRadius = "inherit";
    fill.style.background = options.color ?? theme.colors[0];
    track.appendChild(fill);
    wrapper.appendChild(track);
    const labels = document.createElement("div");
    labels.className = "facet-card-progress-labels";
    labels.style.display = "flex";
    labels.style.justifyContent = "space-between";
    labels.style.gap = "8px";
    labels.style.marginTop = "6px";
    labels.style.color = theme.subtitle.color;
    labels.style.fontSize = "11px";
    const progressLabel = document.createElement("span");
    progressLabel.textContent = options.label ?? `${formatValue(ratio, ".0%")} achieved`;
    const targetLabel = document.createElement("span");
    targetLabel.textContent = options.targetLabel ??
      `Target ${formatCardValue(options.target, options.format ?? this.options.format)}`;
    labels.append(progressLabel, targetLabel);
    wrapper.appendChild(labels);
    applyStyle(wrapper, this.options.style?.progress);
    return wrapper;
  }

  private renderBreakdown(
    options: CardBreakdownOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const grid = document.createElement("div");
    grid.className = "facet-card-breakdown";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, options.items.length)}, minmax(0, 1fr))`;
    grid.style.gap = "8px";
    grid.style.marginTop = "14px";
    options.items.forEach((item, index) => {
      const entry = document.createElement("div");
      entry.className = "facet-card-breakdown-item";
      entry.style.minWidth = "0";
      entry.style.paddingTop = "7px";
      entry.style.borderTop = `3px solid ${item.color ?? theme.colors[index % theme.colors.length]}`;
      const label = document.createElement("div");
      label.className = "facet-card-breakdown-label";
      label.textContent = item.label;
      label.style.color = theme.subtitle.color;
      label.style.fontSize = "11px";
      const value = document.createElement("div");
      value.className = "facet-card-breakdown-value";
      value.textContent = formatCardValue(item.value, item.format ?? this.options.format);
      value.style.marginTop = "2px";
      value.style.fontSize = "13px";
      value.style.fontWeight = "600";
      value.style.overflowWrap = "anywhere";
      entry.append(label, value);
      grid.appendChild(entry);
    });
    applyStyle(grid, this.options.style?.breakdown);
    return grid;
  }

  private renderSplitComparison(
    options: CardComparisonOptions,
    comparison: ResolvedComparison,
    formattedCurrent: string,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const split = document.createElement("div");
    split.className = `facet-card-comparison facet-card-comparison-split facet-card-comparison-${comparison.sentiment}`;
    split.dataset.direction = comparison.direction;
    split.style.display = "grid";
    split.style.gridTemplateColumns = "minmax(0, 1fr) 1px minmax(0, 1fr)";
    split.style.alignItems = "center";
    split.style.gap = "14px";
    split.style.marginTop = "14px";

    const current = comparisonColumn(
      options.currentLabel ?? "Current",
      formattedCurrent,
      theme,
      true,
    );
    const divider = document.createElement("div");
    divider.className = "facet-card-comparison-divider";
    divider.style.alignSelf = "stretch";
    divider.style.background = theme.axis.lineColor;
    const previousValue = finite(options.previousValue) ?? 0;
    const previous = comparisonColumn(
      options.previousLabel ?? "Previous",
      formatCardValue(previousValue, options.format ?? this.options.format),
      theme,
      false,
    );
    const analysis = document.createElement("div");
    analysis.className = "facet-card-comparison-value";
    analysis.textContent = comparison.text;
    analysis.style.color = comparison.color;
    analysis.style.fontSize = "12px";
    analysis.style.fontWeight = "600";
    analysis.style.marginTop = "3px";
    previous.appendChild(analysis);
    split.append(current, divider, previous);
    applyStyle(split, this.options.style?.comparison);
    return split;
  }

  private renderGoal(
    options: CardGoalOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const current = finite(options.current) ?? numericCardValue(this.options.value) ?? 0;
    const ratio = options.target === 0 ? 0 : clamp01(current / options.target);
    const wrapper = document.createElement("div");
    wrapper.className = "facet-card-goal";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.gap = "18px";
    wrapper.style.marginTop = "12px";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 112 112");
    svg.setAttribute("width", "112");
    svg.setAttribute("height", "112");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${formatValue(ratio, ".0%")} of goal`);
    svg.classList.add("facet-card-goal-ring");
    const track = document.createElementNS(svg.namespaceURI, "circle");
    track.setAttribute("cx", "56");
    track.setAttribute("cy", "56");
    track.setAttribute("r", "36");
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", options.trackColor ?? theme.axis.gridLineColor);
    track.setAttribute("stroke-width", "11");
    const progress = document.createElementNS(svg.namespaceURI, "circle");
    const circumference = 2 * Math.PI * 36;
    progress.setAttribute("cx", "56");
    progress.setAttribute("cy", "56");
    progress.setAttribute("r", "36");
    progress.setAttribute("fill", "none");
    progress.setAttribute("stroke", options.color ?? toneColor("positive", theme));
    progress.setAttribute("stroke-width", "11");
    progress.setAttribute("stroke-linecap", "round");
    progress.setAttribute("stroke-dasharray", String(circumference));
    progress.setAttribute("stroke-dashoffset", String(circumference * (1 - ratio)));
    progress.setAttribute("transform", "rotate(-90 56 56)");
    const percent = document.createElementNS(svg.namespaceURI, "text");
    percent.setAttribute("x", "56");
    percent.setAttribute("y", "61");
    percent.setAttribute("text-anchor", "middle");
    percent.setAttribute("fill", theme.title.color);
    percent.setAttribute("font-size", "18");
    percent.setAttribute("font-weight", "600");
    percent.textContent = formatValue(ratio, ".0%");
    svg.append(track, progress, percent);
    const detail = document.createElement("div");
    detail.className = "facet-card-goal-detail";
    const value = this.renderValue(
      formatCardValue(current, options.format ?? this.options.format),
      false,
      theme,
    );
    value.style.marginTop = "0";
    const label = this.renderMutedText(
      "facet-card-goal-label",
      options.label ?? `of ${formatCardValue(options.target, options.format ?? this.options.format)}`,
      theme,
      3,
    );
    detail.append(value, label);
    wrapper.append(svg, detail);
    applyStyle(wrapper, this.options.style?.goal);
    return wrapper;
  }

  private renderRange(
    options: CardRangeOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const value = finite(options.value) ?? numericCardValue(this.options.value) ?? options.min;
    const span = options.max - options.min;
    const position = span === 0 ? 0 : clamp01((value - options.min) / span);
    const wrapper = document.createElement("div");
    wrapper.className = "facet-card-range";
    wrapper.style.marginTop = "16px";
    const track = document.createElement("div");
    track.className = "facet-card-range-track";
    track.style.position = "relative";
    track.style.height = "6px";
    track.style.borderRadius = "999px";
    track.style.background = `linear-gradient(90deg, ${toneColor("positive", theme)}, ${toneColor("warning", theme)}, ${toneColor("negative", theme)})`;
    const marker = document.createElement("span");
    marker.className = "facet-card-range-marker";
    marker.style.position = "absolute";
    marker.style.left = `${position * 100}%`;
    marker.style.top = "50%";
    marker.style.width = "14px";
    marker.style.height = "14px";
    marker.style.border = `3px solid ${theme.backgroundColor}`;
    marker.style.borderRadius = "50%";
    marker.style.background = theme.title.color;
    marker.style.transform = "translate(-50%, -50%)";
    marker.title = formatCardValue(value, options.format ?? this.options.format);
    track.appendChild(marker);
    if (finite(options.target) !== undefined && span !== 0) {
      const target = document.createElement("span");
      target.className = "facet-card-range-target";
      target.style.position = "absolute";
      target.style.left = `${clamp01(((options.target as number) - options.min) / span) * 100}%`;
      target.style.top = "-5px";
      target.style.width = "2px";
      target.style.height = "16px";
      target.style.background = theme.title.color;
      target.title = options.targetLabel ?? `Target ${formatCardValue(options.target as number, options.format ?? this.options.format)}`;
      track.appendChild(target);
    }
    wrapper.appendChild(track);
    const labels = document.createElement("div");
    labels.className = "facet-card-range-labels";
    labels.style.display = "flex";
    labels.style.justifyContent = "space-between";
    labels.style.gap = "8px";
    labels.style.marginTop = "7px";
    labels.style.color = theme.subtitle.color;
    labels.style.fontSize = "11px";
    const low = document.createElement("span");
    low.textContent = options.minLabel ?? formatCardValue(options.min, options.format ?? this.options.format);
    const targetLabel = document.createElement("span");
    targetLabel.textContent = options.target !== undefined
      ? options.targetLabel ?? `Target ${formatCardValue(options.target, options.format ?? this.options.format)}`
      : "";
    const high = document.createElement("span");
    high.textContent = options.maxLabel ?? formatCardValue(options.max, options.format ?? this.options.format);
    labels.append(low, targetLabel, high);
    wrapper.appendChild(labels);
    applyStyle(wrapper, this.options.style?.range);
    return wrapper;
  }

  private renderContext(
    options: CardContextOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "facet-card-context";
    wrapper.style.marginTop = "12px";
    if (options.message) {
      const message = document.createElement("div");
      message.className = "facet-card-context-message";
      message.textContent = options.message;
      message.style.color = toneColor("positive", theme);
      message.style.fontSize = "12px";
      message.style.fontWeight = "600";
      message.style.marginBottom = "10px";
      wrapper.appendChild(message);
    }
    const grid = document.createElement("div");
    grid.className = "facet-card-context-values";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    grid.style.gap = "8px";
    const values: Array<[string, number]> = [
      [options.minLabel ?? "Low", options.min],
      [options.averageLabel ?? "Average", options.average],
      [options.maxLabel ?? "High", options.max],
    ];
    values.forEach(([labelText, raw]) => {
      const entry = document.createElement("div");
      const label = document.createElement("div");
      label.textContent = labelText;
      label.style.color = theme.subtitle.color;
      label.style.fontSize = "11px";
      const value = document.createElement("div");
      value.textContent = formatCardValue(raw, options.format ?? this.options.format);
      value.style.fontSize = "12px";
      value.style.fontWeight = "600";
      entry.append(label, value);
      grid.appendChild(entry);
    });
    wrapper.appendChild(grid);
    applyStyle(wrapper, this.options.style?.context);
    return wrapper;
  }

  private renderSummary(
    options: CardSummaryOptions,
    theme: ReturnType<typeof resolveTheme>,
  ): HTMLDivElement {
    const list = document.createElement("div");
    list.className = "facet-card-summary";
    list.style.display = "grid";
    list.style.gap = "7px";
    list.style.marginTop = "12px";
    options.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = `facet-card-summary-item facet-card-summary-${item.tone ?? "neutral"}`;
      row.style.display = "grid";
      row.style.gridTemplateColumns = "8px minmax(0, 1fr) auto";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.fontSize = "12px";
      const dot = document.createElement("span");
      dot.className = "facet-card-summary-dot";
      dot.style.width = "8px";
      dot.style.height = "8px";
      dot.style.borderRadius = "50%";
      dot.style.background = item.color ?? toneColor(item.tone ?? "neutral", theme);
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("span");
      value.textContent = String(item.value);
      value.style.color = theme.subtitle.color;
      row.append(dot, label, value);
      list.appendChild(row);
    });
    applyStyle(list, this.options.style?.summary);
    return list;
  }

  private forecastChartOptions(options: CardForecastOptions): ChartOptions {
    const color = options.color ?? resolveTheme(this.options.theme).colors[0];
    return {
      chart: { type: "line", height: options.height ?? this.options.chartHeight ?? 76 },
      series: [
        ...(options.range
          ? [{
              type: "arearange" as const,
              name: "Forecast range",
              data: options.range,
              color,
              fillOpacity: 0.16,
              lineWidth: 0,
              marker: { enabled: false },
              showInLegend: false,
            }]
          : []),
        {
          type: "spline",
          name: "Forecast",
          data: options.data,
          color,
          lineWidth: 2.5,
          marker: { enabled: false },
          showInLegend: false,
        },
      ],
    };
  }

  private formattedValue(): string {
    if (this.options.value === undefined) return "";
    if (this.options.valueFormatter)
      return String(this.options.valueFormatter({ value: this.options.value }));
    if (typeof this.options.value === "number") {
      if (!Number.isFinite(this.options.value)) return "—";
      return this.options.format
        ? formatValue(this.options.value, this.options.format)
        : String(this.options.value);
    }
    return String(this.options.value);
  }

  private resolveComparison(): ResolvedComparison | undefined {
    const options = this.options.comparison;
    if (!options) return undefined;
    const current = typeof this.options.value === "number" && Number.isFinite(this.options.value)
      ? this.options.value
      : undefined;
    return resolveChange(
      current,
      { ...options, format: options.format ?? this.options.format, icon: options.showIcon === false ? "none" : "arrow" },
      resolveTheme(this.options.theme),
      this.options.value ?? "",
    );
  }

  private renderComparison(comparison: ResolvedComparison): HTMLDivElement {
    const row = document.createElement("div");
    row.className = `facet-card-comparison facet-card-comparison-${comparison.sentiment}`;
    row.dataset.direction = comparison.direction;
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "baseline";
    row.style.gap = "5px";
    row.style.marginTop = "8px";
    row.style.fontSize = "12px";
    row.style.fontWeight = "600";
    row.style.lineHeight = "1.35";
    row.style.color = comparison.color;
    applyStyle(row, this.options.style?.comparison);

    const analysis = document.createElement("span");
    analysis.className = "facet-card-comparison-value";
    analysis.textContent = comparison.text;
    row.appendChild(analysis);
    if (comparison.label) {
      const label = document.createElement("span");
      label.className = "facet-card-comparison-label";
      label.textContent = comparison.label;
      label.style.color = resolveTheme(this.options.theme).subtitle.color;
      label.style.fontWeight = "400";
      applyStyle(label, this.options.style?.comparisonLabel);
      row.appendChild(label);
    }
    return row;
  }

  private chartOptions(options: ChartOptions): ChartOptions {
    const defaultHeight = this.options.chartHeight ??
      (this.options.layout === "horizontal" ? 120 : 76);
    const type = options.chart?.type ?? options.series[0]?.type ?? "sparkline";
    return merge(
      {} as ChartOptions,
      {
        chart: {
          type,
          height: defaultHeight,
          spacing: [3, 1, 3, 1],
          backgroundColor: "transparent",
          animation: false,
        },
        title: { enabled: false },
        subtitle: { enabled: false },
        xAxis: { visible: false },
        yAxis: { visible: false },
        legend: { enabled: false },
        tooltip: { enabled: true },
        series: [],
        theme: this.options.theme,
      } as ChartOptions,
      options,
    );
  }

  private applyAccessibility(
    root: HTMLDivElement,
    title: string | undefined,
    value: string,
    comparison: ResolvedComparison | undefined,
  ): void {
    if (this.options.accessibility?.enabled === false) return;
    root.setAttribute("role", "group");
    const generated = [title, value, comparison?.text, comparison?.label]
      .filter(Boolean)
      .join(", ");
    root.setAttribute(
      "aria-label",
      this.options.accessibility?.description ?? (generated || "Metric card"),
    );
  }
}

function titleOptions(
  title: FacetCardOptions["title"],
): CardTitleOptions | undefined {
  if (typeof title === "string") return { text: title };
  return title;
}


function numericCardValue(value: CardValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}



function comparisonColumn(
  labelText: string,
  valueText: string,
  theme: ReturnType<typeof resolveTheme>,
  prominent: boolean,
): HTMLDivElement {
  const column = document.createElement("div");
  column.className = prominent
    ? "facet-card-comparison-current"
    : "facet-card-comparison-previous";
  column.style.minWidth = "0";
  const label = document.createElement("div");
  label.textContent = labelText;
  label.style.color = theme.subtitle.color;
  label.style.fontSize = "11px";
  const value = document.createElement("div");
  value.textContent = valueText;
  value.style.marginTop = "3px";
  value.style.color = theme.title.color;
  value.style.fontSize = prominent ? "28px" : "20px";
  value.style.fontWeight = "700";
  value.style.lineHeight = "1.1";
  value.style.overflowWrap = "anywhere";
  column.append(label, value);
  return column;
}




