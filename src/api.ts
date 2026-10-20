/** Public API shared by the full and renderer-free core entrypoints. */

export { FacetViz } from "./core/chart.js";
export { FacetViz as Chart } from "./core/chart.js";
export { FacetTable } from "./core/table.js";
export { FacetTable as ChartTable } from "./core/table.js";
export { FacetCard } from "./core/card.js";
export { FacetCard as Card } from "./core/card.js";
export { pivotData } from "./core/pivot.js";

export type {
  CardValue,
  CardStyle,
  CardTitleOptions,
  CardValueContext,
  CardComparisonContext,
  CardComparisonOptions,
  CardTone,
  CardProgressOptions,
  CardBreakdownItem,
  CardBreakdownOptions,
  CardGoalOptions,
  CardStatusOptions,
  CardRangeOptions,
  CardForecastOptions,
  CardContextOptions,
  CardSummaryItem,
  CardSummaryOptions,
  CardStyleOptions,
  CardAccessibilityOptions,
  CardAccentOptions,
  CardBadgeItem,
  CardBand,
  CardBarItem,
  CardChangeItem,
  CardChartItem,
  CardDividerItem,
  CardIconItem,
  CardImageItem,
  CardItem,
  CardItemPin,
  CardRingItem,
  CardRow,
  CardSpacerItem,
  CardStackItem,
  CardTextItem,
  CardTextSpan,
  CardValueItem,
  FacetCardOptions,
} from "./core/card.js";

export type {
  PivotAggregateOperation,
  PivotAggregate,
  PivotFieldOrder,
  PivotField,
  PivotFieldInput,
  PivotTableRow,
  PivotMeasure,
  PivotGrandTotalsOptions,
  PivotDataOptions,
  PivotDataResult,
} from "./core/pivot.js";

export type {
  FacetTableRow,
  FacetTableRowMetadata,
  FacetTableCellDescriptor,
  FacetTableColumnStyle,
  FacetTableOptions,
  FacetTableColumn,
  FacetTableColumnGroup,
  FacetTableColumnDefinition,
  FacetTableCellFormatter,
  FacetTableCellChartOptions,
  FacetTableStyle,
  FacetTableStyleOptions,
  FacetTablePaginationLabels,
  FacetTablePaginationOptions,
  FacetTableSortDirection,
  FacetTableSortIndicator,
  FacetTableSortIndicatorPaths,
  FacetTableColumnSortOptions,
  FacetTableSortState,
  FacetTableColumnFilterOptions,
  FacetTableFilterState,
  FacetTableRowDensity,
  FacetTableLayoutOptions,
  FacetTableHeaderAppearance,
  FacetTableRowsAndColumnsAppearance,
  FacetTableBorderAppearance,
  FacetTableAppearanceOptions,
} from "./core/table.js";

export type {
  ChartOptions,
  SeriesOptions,
  AreaFillColor,
  LinearGradientColor,
  GradientCoordinate,
  GradientOffset,
  AxisOptions,
  ChartType,
  PointOptions,
  PointInput,
  TooltipOptions,
  TooltipContext,
  LegendColorKey,
  LegendColorScale,
  LegendOptions,
  TitleOptions,
  AxisTitleOptions,
  AxisLabelOptions,
  PlotOptions,
  TrellisOptions,
  AnnotationOptions,
  ChartTextOptions,
  ResponsiveCondition,
  ResponsiveChartOptions,
  ResponsiveRule,
  StackingMode,
  AppendDataOptions,
  MarkerOptions,
  DataLabelOptions,
  LabelContext,
  PlotLineOptions,
  PlotBandOptions,
  HoverStateOptions,
  SeriesTooltipOptions,
  AccessibilityOptions,
  AccessibilityPointContext,
  ChartValidationSeverity,
  ChartValidationIssue,
  ChartValidationResult,
  ChartValidationOptions,
  ChartEvents,
  SeriesEvents,
  FacetVizPointEvent,
} from "./core/options.js";

export { resolveTheme, registerTheme, LIGHT_THEME } from "./core/theme.js";
export type { Theme, ThemeInput } from "./core/theme.js";
export type { LegendItem } from "./core/legend.js";

export type {
  BoxplotPointOptions,
  BoxplotSeriesOptions,
  BoxColors,
} from "./series/boxplot.js";
export type {
  DumbbellSeriesOptions,
  DumbbellPointOptions,
} from "./series/dumbbell.js";
export type { CandlestickPointOptions } from "./series/candlestick.js";
export type { BulletPointOptions } from "./series/bullet.js";
export type { WaterfallPointOptions, WaterfallSeriesOptions } from "./series/waterfall.js";
export type { SankeyPointOptions } from "./series/sankey.js";
export type { MapFeature, MapGeometry, MapSeriesOptions, MapPointOptions } from "./series/map.js";
export type { DecompPointOptions, DecompSeriesOptions } from "./series/decomp.js";
export type { GanttPointOptions } from "./series/gantt.js";
export type { CalendarPointOptions } from "./series/calendar.js";
export type { GaugeSeriesOptions } from "./series/gauge.js";
export type { HistogramSeriesOptions } from "./series/histogram.js";
export type { PieSeriesOptions, PieCenterLabelOptions } from "./series/pie.js";
export type { BubbleSeriesOptions } from "./series/bubble.js";
export type {
  ScatterSeriesOptions,
  ScatterPointOptions,
} from "./series/scatter.js";
export type {
  SparklineOptions,
  SparklineSeriesOptions,
} from "./series/sparkline.js";

export {
  registerSeriesType,
  registerSeriesTypes,
  createSeries,
  isSeriesTypeRegistered,
} from "./series/registry.js";
export type { SeriesConstructor } from "./series/registry.js";
export { BaseSeries } from "./series/base.js";
export type { SeriesRenderContext, SeriesCapabilities } from "./series/base.js";

export { LinearScale, LogScale, CategoryScale } from "./core/scale.js";
export type { Scale } from "./core/scale.js";
export { Renderer } from "./core/renderer.js";
export { DEFAULT_COLORS } from "./core/colors.js";
export { validateChartOptions, ChartValidationError } from "./core/validation.js";

export {
  formatString,
  formatValue,
  formatNumber,
  formatDate,
  abbreviateNumber,
  groupThousands,
} from "./core/utils.js";
