# FacetViz API Reference

Complete reference for every configuration key. FacetViz's config object follows
familiar declarative charting conventions, so most option names will be recognizable.

```ts
import { FacetViz } from "facetviz";

const chart = new FacetViz(container, options);
```

- **`container`** — a DOM element, or a CSS selector string resolving to one.
- **`options`** — a [`ChartOptions`](#chartoptions) object (only `series` is required).

**Contents**

- [ChartOptions](#chartoptions) · [chart](#chartoptions-chart) · [title / subtitle](#title--subtitle)
- [Axes](#axisoptions) · [plotLines](#plotlineoptions) · [plotBands](#plotbandoptions)
- [series](#seriesoptions) · [marker](#markeroptions) · [dataLabels](#datalabeloptions) · [states.hover](#hoverstateoptions) · [boxColors](#boxplot-options) · [dumbbell](#dumbbell-options) · [gauge](#gauge-options)
- [tooltip](#tooltipoptions) · [legend](#legendoptions) · [plotOptions](#plotoptions)
- [trellis](#trellisoptions) · [nested x-axis](#nested-hierarchical-x-axis) · [chart text](#chart-text)
- [Events](#events) · [Data formats](#point-data-formats) · [Chart types](#chart-types)
- [Charts inside table cells](#charts-inside-table-cells)
- [Instance methods](#instance-methods) · [Exports](#package-exports)

---

## Charts inside table cells

`FacetTable` combines semantic HTML value columns with compact FacetViz charts.
Mark a column with `chart` and its row value becomes the chart's data. The
default cell renderer is a 44 px sparkline; every other column remains normal
text, so formatting, selection, and screen-reader table navigation keep working.

```ts
import { FacetTable } from "facetviz";

const table = new FacetTable("#performance", {
  caption: "Product performance",
  rows: [
    { product: "Alpha", revenue: 120000, trend: [5, 8, 6, 11, 14] },
    { product: "Beta",  revenue:  85000, trend: [4, 5, 7,  8,  9] },
  ],
  columns: [
    { key: "product", header: "Product", sortable: true, filterable: true },
    {
      key: "revenue",
      header: "Revenue",
      horizontalAlign: "right",
      verticalAlign: "bottom",
      sortable: { initialDirection: "desc" },
      format: "{value:$,.0f}",
    },
    {
      key: "trend",
      header: "Trend",
      width: 180,
      chart: {
        type: "sparkline",
        scale: "shared",
        options: {
          tooltip: { valuePrefix: "$" },
          plotOptions: { sparkline: { sparkline: { min: true, max: true } } },
        },
      },
    },
  ],
  pagination: {
    pageSize: 25,
    pageSizeOptions: [10, 25, 50, 100],
    align: "right",
  },
  style: {
    table: { fontSize: "13px" },
    headerCell: { backgroundColor: "#eef2ff", color: "#312e81" },
    row: (_row, index) => ({
      backgroundColor: index % 2 ? "#f8fafc" : "#fff",
    }),
    chartHost: { borderRadius: "4px" },
    pagination: { borderTop: "1px solid #e5e7eb" },
  },
});

table.setRows(nextRows);
table.setPage(2);
table.setPageSize(50);
table.sortBy("revenue", "asc");
table.clearSort();
table.setFilter("product", "alp");
table.clearFilter("product");
table.clearFilters();
table.reflow(); // after a hidden/resizable parent becomes visible
table.destroy();
```

Use `chart.scale: "independent"` (the default) when each sparkline should
emphasize its own shape. Use `"shared"` when heights or bar lengths must be
comparable across rows. For advanced cells, `chart.series(value, row, rowIndex)`
can return any FacetViz series configuration, so a cell can use `bar`, `bullet`,
or another registered chart type instead of a sparkline. For data-only JSON,
set `chart.series: "value"` and store a complete `SeriesOptions[]` in the cell;
this supports multi-series and combo cells without a callback.

### `FacetTableOptions<Row>`

| Field | Type | Default | Description |
|---|---|---|---|
| `rows` | `Row[]` | required | Objects rendered as table rows. |
| `columns` | `FacetTableColumnDefinition<Row>[]` | required | Leaf columns or recursively nested column groups. |
| `caption` | `string` | – | Native table caption. |
| `className` | `string` | – | Additional class on the generated table. |
| `layout` | `FacetTableLayoutOptions` | – | Structure, density, wrapping, frozen rows/columns, and CSS table layout. |
| `emptyText` | `string` | `"No data"` | Message shown when `rows` is empty. |
| `appearance` | `FacetTableAppearanceOptions` | – | Semantic header, row/column, hover, and border presentation. |
| `style` | `FacetTableStyleOptions<Row>` | – | Top-level CSS overrides for every table region. |
| `pagination` | `boolean \| FacetTablePaginationOptions` | `false` | Render only the current page and add navigation controls. |

Each leaf column requires `key` and accepts `header`, `width`, `horizontalAlign`,
`verticalAlign`, `sortable`, `filterable`, `style`, and `headerStyle`.
`horizontalAlign` accepts `"left"`, `"center"`,
or `"right"`; the older `align` field remains an alias. `verticalAlign` accepts
`"top"`, `"middle"`, or `"bottom"` and defaults to `"middle"`.

A normal column can provide a declarative `format` string such as
`"{value:$,.0f}"`, `"{value:.1%}"`, or `"{row.product}: {value}"`. Available
tokens are `value`, `row`, `rowIndex`, and `column`, including dotted paths.
`formatter(value, row, rowIndex)` remains available for custom text or DOM nodes
and takes precedence over `format`. Adding `chart` turns the column into a chart
column; chart options are `type`, `height`, `minWidth`, `scale`, `options`, and
the optional `series` factory.

### Multi-level column headers

Use a column group with `header` and nested `columns` to create pivot-style
headers. Groups can contain leaf columns or more groups at any depth. FacetTable
automatically calculates the required `colSpan` and `rowSpan`; body cells,
sorting, filtering, formatting, charts, borders, and width continue to use the
flattened leaf columns.

```ts
new FacetTable("#pivot", {
  rows,
  columns: [
    { key: "category", header: "Category" },
    { key: "product", header: "Product" },
    {
      header: "Bengaluru",
      columns: [
        { key: "bengaluruRevenue", header: "Revenue",
          format: "{value:,.2f}", sortable: true },
        { key: "bengaluruAverage", header: "Average Price",
          format: "{value:,.2f}", sortable: true },
      ],
    },
    {
      header: "Chennai",
      columns: [
        { key: "chennaiRevenue", header: "Revenue",
          format: "{value:,.2f}", sortable: true },
        { key: "chennaiAverage", header: "Average Price",
          format: "{value:,.2f}", sortable: true },
      ],
    },
  ],
  style: {
    columnGroupHeader: { textAlign: "center", fontWeight: 800 },
  },
});
```

A group accepts `horizontalAlign`, `verticalAlign`, and `headerStyle`.
`style.columnGroupHeader` applies to every group header, while a group's
`headerStyle` customizes only that group. Leaf sorting and filtering controls
remain in the lowest header row. Empty groups are rejected.

### Generate a pivot table from raw data

`pivotData(data, options)` is a separate transformer that returns FacetTable
`rows` and `columns`. FacetTable remains a renderer; the helper performs the
client-side grouping and aggregation before the table is created.

```ts
import { FacetTable, pivotData } from "facetviz";

const pivot = pivotData(salesRows, {
  rows: ["category", "product"],
  columns: ["city"],
  measures: [
    {
      key: "revenue",
      header: "Revenue",
      aggregate: "sum",
      format: "{value:$,.2f}",
      sortable: true,
    },
    {
      key: "unitPrice",
      header: "Average Price",
      aggregate: "average",
      format: "{value:,.2f}",
    },
  ],
  subtotals: true,
  grandTotals: true,
  emptyValue: null,
});

new FacetTable("#pivot", {
  ...pivot,
  pagination: { pageSize: 25 },
  appearance: {
    rowsAndColumns: { displayEmptyCellAs: "—" },
  },
});
```

Built-in aggregates are `"sum"`, `"average"`/`"avg"`, `"count"`, `"min"`,
and `"max"`. A measure may instead use
`aggregate(values, sourceRows) => result` for weighted or domain-specific
calculations. Every subtotal and grand total is calculated from its matching
raw source records, never by combining displayed subtotal values.

Row and column fields may be strings or descriptors:

```ts
rows: [
  { key: "category", header: "Category", order: "asc" },
  "product",
],
columns: [
  {
    key: "city",
    order: ["Bengaluru", "Chennai"],
    formatter: (value) => `City: ${value}`,
  },
]
```

Field `order` accepts source order (when omitted), `"asc"`, `"desc"`, an
explicit value array, or a comparator. Multiple column fields create arbitrary
nested header groups. Multiple measures become leaf columns inside every final
group. Measure options pass through `format`, `sortable`, `filterable`, `style`,
`headerStyle`, `width`, alignment, and `chart`.

`grandTotals: true` adds both the total row and total column group. Use
`{ rows: true, columns: false }` to control them independently. Generated rows
include `rowType` and `groupPath`, so summary styling and group-safe FacetTable
sorting work automatically. `emptyValue` defaults to `null`; generated data
keys are deterministic and avoid row-field and metadata-key collisions.

### Pre-grouped rows and summary rows

FacetTable renders grouped results prepared by your database or application; it
does not calculate aggregates. Put the final display values directly in
`rows` and add two optional metadata fields:

- `rowType: "detail" | "subtotal" | "grandTotal"` selects the row behavior
  and the matching `style.subtotalRow` or `style.grandTotalRow` styling.
- `groupPath: unknown[]` identifies detail rows that may be sorted together.
  Use the same path for sibling details, such as `["Beverages", "Bread"]`.

```ts
const table = new FacetTable("#sales", {
  rows: [
    {
      category: "Beverages", product: "Bread", city: "Bengaluru",
      revenue: 949.19,
      rowType: "detail", groupPath: ["Beverages", "Bread"],
    },
    {
      category: "Beverages", product: "Bread", city: "Chennai",
      revenue: 36797.68,
      rowType: "detail", groupPath: ["Beverages", "Bread"],
    },
    {
      category: "Beverages", product: "Bread — subtotal", city: "",
      revenue: 37746.87,
      rowType: "subtotal", groupPath: ["Beverages", "Bread"],
    },
    {
      category: "Beverages — subtotal", product: "", city: "",
      revenue: 37746.87,
      rowType: "subtotal", groupPath: ["Beverages"],
    },
    {
      category: "Grand total", product: "", city: "",
      revenue: 59197.89,
      rowType: "grandTotal", groupPath: [],
    },
  ],
  columns: [
    { key: "category", header: "Category" },
    { key: "product", header: "Product" },
    { key: "city", header: "City" },
    {
      key: "revenue",
      header: "SUM(Revenue)",
      format: "{value:,.2f}",
      sortable: true,
    },
    {
      key: "revenue",
      header: "Revenue chart",
      chart: { type: "bar", height: 28, scale: "shared" },
    },
  ],
  style: {
    subtotalRow: { backgroundColor: "#f8fafc", fontWeight: 700 },
    grandTotalRow: { backgroundColor: "#f1f5f9", fontWeight: 800 },
  },
});
```

When a grouped table is sorted, FacetTable sorts only detail rows with the same
`groupPath`. It leaves subtotal rows in their supplied positions and keeps the
grand-total row in place. Without row metadata, sorting remains the normal flat
table sort.

FacetTable does not add subtotals to calculate a grand total. This is important
for averages, minima, maxima, weighted values, and other domain calculations:
send the correct final value in the grand-total row.

```ts
rows: [
  { category: "Beverages", average: 15,
    rowType: "subtotal", groupPath: ["Beverages"] },
  { category: "Grocery", average: 100,
    rowType: "subtotal", groupPath: ["Grocery"] },
  { category: "Grand average", average: 43.33,
    rowType: "grandTotal", groupPath: [] },
]
```

Marked rows receive `.facet-table-row-detail`,
`.facet-table-row-subtotal`, or `.facet-table-row-grand-total` and a
`data-row-type` attribute. Filtering and pagination operate on the supplied
rows; if filtering must change aggregates, request or compute a new grouped
result and call `setRows()`.
### Column and per-cell styles

Set `style` on a column to style every body cell in that column. It accepts a
CSS map or `(value, row, rowIndex) => CSSMap`; the callback receives the raw
cell value. Use `headerStyle` for that column's heading:

```ts
columns: [
  {
    key: "revenue",
    header: "Revenue",
    style: (value) => ({
      color: Number(value) < 0 ? "#b91c1c" : "#1d4ed8",
      fontWeight: 700,
    }),
    headerStyle: { backgroundColor: "#dbeafe", color: "#1e3a8a" },
  },
]
```

A row property can be a `FacetTableCellDescriptor` when one cell needs its own
content decoration or CSS. Put the raw data in `value`; `prefix` and `suffix`
wrap the formatted display value. Add CSS properties directly to the descriptor
or use its nested `style` map:

```ts
rows: [
  {
    product: "Atlas",
    revenue: {
      value: 128400,
      color: "red",
      backgroundColor: "green",
      fontWeight: 900,
      style: { borderLeft: "3px solid orange" },
    },
    growth: {
      value: 12.4,
      prefix: "+",
      suffix: "%",
      color: "#45f354",
    },
  },
]
```

The raw `value` is passed to column formatting, formatter callbacks, sorting,
filtering, conditional `style.cell` callbacks, and chart-series construction.
Cell-descriptor CSS is applied last, so it overrides table-wide and column-wide
styles only for that cell. `prefix` and `suffix` decorate normal value cells;
chart cells use `value` as their chart data while still applying the cell CSS.

Body-cell style precedence, from highest to lowest, is:

1. Row cell descriptor (`{ value, color, style, ... }`).
2. Column `style`.
3. Resolved row style from top-level `style.row`.
4. Other top-level `style` slots such as `cell`, `valueCell`, and `chartCell`.
5. `layout` defaults.
6. `appearance` defaults.

For leaf headings, `headerStyle` wins over top-level `style.headerCell`,
`layout`, and `appearance`. Group `headerStyle` wins over
`style.columnGroupHeader` and the same table-wide defaults.

### Table layout and appearance

`layout` controls structure and responsive behavior. `appearance` controls
semantic presentation without requiring raw CSS:

```ts
layout: {
  tableLayout: "fixed", // auto | fixed
  rowDensity: "compact", // responsive | compact | cozy | crazy | comfortable
  bodyTextSize: 12,
  showHeaderRow: true,
  wrapText: false,
  freezeHeaderRow: true,
  freezeFirstColumn: true,
},
appearance: {
  headerRow: {
    fillColor: "#312e81",
    textColor: "#fff",
    textSize: 12,
    alignment: "center",
    bold: true,
    italic: false,
  },
  rowsAndColumns: {
    textColor: "#1f2937",
    rowFill: "#fff",
    dimensionAlignment: "left",
    valueAlignment: "right",
    displayEmptyCellAs: "—",
    bandedRows: true,
    bandedRowsAlternateColor: "#f8fafc",
    bandedColumns: true,
    bandedColumnsAlternateColor: "#eef2ff",
    emphasizeFirstColumn: true,
    emphasizeLastColumn: true,
    highlightRowOnHover: true,
    hoverColor: "#e0e7ff",
  },
  borders: {
    horizontalBorders: true,
    verticalBorders: true,
    outsideBorder: true,
    borderColor: "#c7d2fe",
    borderWidth: 1,
  },
}
```

Density values use compact padding below 600 px, cozy padding from 600–899 px,
and comfortable padding at 900 px or wider when `responsive` is selected.
`crazy` is accepted as an alias for `cozy`. Frozen rows/columns make the table
root scrollable; constrain it with `style.root.maxHeight` and use a table
`minWidth` when both horizontal and vertical scrolling should be demonstrated.

Set a column's `role` to `"dimension"` or `"value"` to choose the corresponding
alignment. Without a role, chart and numeric cells are values; other cells are
dimensions. Per-column `horizontalAlign`/`align` overrides role-based and header
alignment. Low-level `style` slots are applied after `layout` and `appearance`
and can override individual CSS properties.

### Column sorting

Set `sortable: true` on any value or chart column to add an accessible header
button. Each click cycles ascending, descending, and original row order. Sorting
happens before pagination and returns to page 1, so the current page always shows
the correct slice of the sorted data.

Use `sortable: { initialDirection: "asc" | "desc" }` to start sorted. For
formatted or domain-specific values, provide
`compare(a, b, rowA, rowB) => number` in the same object. The default comparator
handles numbers, dates, booleans, and natural text ordering; nullish values stay
at the end. Runtime state is available through `sort`, `sortBy(key, direction)`,
and `clearSort()`.

### Column filtering

Set `filterable: true` to add a funnel button to a column header. The button
opens an accessible filter panel with an input and Apply/Clear actions. Default
matching is a case-insensitive containment check against the raw cell value.
Multiple active column filters are combined with AND logic.

```ts
columns: [
  { key: "product", filterable: true },
  {
    key: "revenue",
    filterable: {
      initialValue: "50000",
      placeholder: "Minimum revenue",
      predicate: (value, filterValue) => Number(value) >= Number(filterValue),
    },
  },
]
```

Filtering happens before sorting and pagination, resets the table to page 1,
and updates the pagination totals. Use `filters`, `setFilter(key, value)`,
`clearFilter(key)`, and `clearFilters()` for programmatic control. An empty
filter value removes that column's filter. If filtering leaves no matching rows,
the table displays `emptyText`.

### Table styling

`style` accepts CSS property maps for `root`, `table`, `caption`, `head`,
`headerRow`, `headerCell`, `columnGroupHeader`, `headerControls`, `sortButton`, `sortIndicator`,
`filterButton`, `activeFilterButton`, `filterIndicator`, `filterPanel`,
`filterInput`, `filterActions`, `filterActionButton`, `body`, `row`, `cell`, `valueCell`, `chartCell`,
`chartHost`, `emptyCell`, `pagination`, `paginationInfo`, `paginationButton`,
`activePageButton`, `pageSizeLabel`, and `pageSizeSelect`. CSS may use camelCase
or kebab-case names; numeric dimensional values are interpreted as pixels.

`row` can also be `(row, rowIndex) => style`, and its resolved CSS is applied
to the row and its cells so row-level styling outranks generic cell styles.
`cell` can be
`(value, row, rowIndex, column) => style`, enabling zebra stripes and
conditional formatting without changing the row data.

### Table pagination

Pass `pagination: true` for a 25-row page with the default 10/25/50/100 page
sizes, or configure it with:

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Disable an existing pagination configuration. |
| `pageSize` | `number` | `25` | Rows rendered per page. |
| `page` | `number` | `1` | Initial 1-based page. |
| `pageSizeOptions` | `number[]` | `[10, 25, 50, 100]` | Page-size choices. |
| `showPageSize` | `boolean` | `true` | Show the page-size selector. |
| `showPageNumbers` | `boolean` | `true` | Show numbered page buttons. |
| `maxPageButtons` | `number` | `5` | Maximum numbered buttons at once. |
| `alwaysShow` | `boolean` | `false` | Show controls when all rows fit on one page. |
| `align` | `"left" \| "center" \| "right"` | `"left"` | Control alignment. |
| `labels` | `FacetTablePaginationLabels` | – | Override navigation and information labels. |
| `onPageChange` | `(page, pageSize) => void` | – | Called after page or page-size changes. |

Only the current page's cell charts are mounted, keeping large tables light.
A shared chart-column scale still uses all rows, so comparisons remain stable
while paging. Runtime state is exposed through `page`, `pageSize`, `pageCount`,
`setPage(page)`, and `setPageSize(size)`.

### Large tables and pivots

FacetTable renders semantic HTML cells rather than a virtualized grid. Enable
pagination whenever a table may contain thousands of rows; sorting and
filtering still use the complete source data, while only the current page is
mounted in the DOM:

```ts
new FacetTable("#results", {
  rows,
  columns,
  pagination: { pageSize: 25, pageSizeOptions: [25, 50, 100] },
});
```

Pagination limits rows, not columns. For pivots, keep the combined cardinality
of `columns` fields and `measures` bounded: a pivot with 20 cities, four
quarters, and two measures produces 160 value columns. Filter or aggregate the
source data before `pivotData()` when that width is not useful to a reader.
FacetTable caches processed rows between renders and invalidates the cache when
rows, columns, filters, or sorting change.

---

## ChartOptions

The root object passed to `new FacetViz(container, options)`.

| Key            | Type                                             | Default       | Description                                                           |
| -------------- | ------------------------------------------------ | ------------- | --------------------------------------------------------------------- |
| `chart`        | [`ChartConfig`](#chartoptions-chart)             | `{}`          | Chart-wide settings (type, size, background, events).                 |
| `title`        | [`TitleOptions`](#title--subtitle)               | –             | Main heading. Omit `text` to hide.                                    |
| `subtitle`     | [`TitleOptions`](#title--subtitle)               | –             | Secondary heading under the title.                                    |
| `xAxis`        | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}`          | X-axis config; arrays support a primary axis plus one secondary axis. |
| `yAxis`        | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}`          | Y-axis config; arrays support a primary axis plus one secondary axis. |
| `tooltip`      | [`TooltipOptions`](#tooltipoptions)              | enabled       | Hover tooltip config.                                                 |
| `legend`       | [`LegendOptions`](#legendoptions)                | enabled       | Legend config and placement.                                          |
| `plotOptions`  | [`PlotOptions`](#plotoptions)                    | –             | Defaults applied to all series or per type.                           |
| `series`       | [`SeriesOptions[]`](#seriesoptions)              | **required**  | One entry per data series.                                            |
| `colors`       | `string[]`                                       | theme palette | Colours cycled through by series lacking an explicit colour.          |
| `theme`        | `string \| ThemeInput`                           | `'light'`     | Visual theme — see [Theming](#theming).                               |
| `trellis`      | [`TrellisOptions`](#trellisoptions)              | –             | Small-multiples / cross-tab table split.                              |
| `annotations`  | [`AnnotationOptions[]`](#annotations)            | –             | Value-anchored labels, callouts, and highlights.                      |
| `texts`        | [`ChartTextOptions[]`](#chart-text)              | –             | Text blocks positioned from chart edges or centre.                   |
| `responsive`   | [`ResponsiveRule[]`](#responsive-rules)          | –             | Size-matched option overrides.                                        |
| `seriesEvents` | [`SeriesEvents`](#events)                        | –             | Event callbacks applied to every series.                              |

---

### ChartOptions.chart

| Key                         | Type                               | Default          | Description                                                                                                       |
| --------------------------- | ---------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `type`                      | [`ChartType`](#chart-types)        | `'line'`         | Default series type when a series omits its own `type`.                                                           |
| `width`                     | `number`                           | container width  | Chart width in px. Falls back to the container's width, then `640`.                                               |
| `height`                    | `number`                           | `400`            | Chart height in px.                                                                                               |
| `backgroundColor`           | `string`                           | `'#fff'`         | Plot background fill.                                                                                             |
| `spacing`                   | `[number, number, number, number]` | `[16,16,16,16]`  | Outer padding `[top, right, bottom, left]`.                                                                       |
| `inverted`                  | `boolean`                          | `false`          | Swap axes: Cartesian categories become vertical; in general polar charts x becomes radial and y becomes circular. |
| `polar`                     | `boolean`                          | `false`          | Project line, spline, step, area, scatter, jitter, column, and dumbbell series into a shared polar frame.         |
| `polarInnerSize`            | `number \| string`                 | `0`              | Donut-style centre hole: pixels or a percentage such as `'35%'`.                                                  |
| `polarInnerBackgroundColor` | `string`                           | chart background | Fill of the polar centre hole; use `'#fff'` for a white circle.                                                   |
| `polarGridLineMode`         | `'spoke' \| 'sector'`              | `'spoke'`        | Draw angular grid lines through category centres or along sector boundaries.                                      |
| `colors`                    | `string[]`                         | –                | Alias of top-level `colors`.                                                                                      |
| `events`                    | [`ChartEvents`](#events)           | –                | Chart-level `load` / `render` / `click` callbacks.                                                                |
| `responsive`                | `boolean`                          | `true`           | Compact default axis-title/legend gaps on constrained charts, hide data labels below a 180 px short side, and hide axis lines below 110 px; explicit margins stay fixed and `false` disables automatic simplification. |
| `scaleFonts`                | `boolean`                          | `true`           | Scale default and explicitly configured chart font sizes with chart dimensions. Set `false` when a supplied `fontSize` must remain an exact CSS pixel value. |

> The chart is **responsive**: the SVG scales down (`max-width: 100%`) to never
> overflow its parent, even when an explicit `width` is larger than the container.

---

### Title & subtitle

`TitleOptions` (used by both `title` and `subtitle`):

| Key       | Type                            | Default    | Description                                          |
| --------- | ------------------------------- | ---------- | ---------------------------------------------------- |
| `text`    | `string`                        | –          | Title text.                                          |
| `enabled` | `boolean`                       | `true`     | Hide the title while preserving its configuration.   |
| `align`   | `'left' \| 'center' \| 'right'` | `'center'` | Horizontal alignment.                                |
| `margin`  | `number`                        | auto       | Space below the title block.                         |
| `offsetY` | `number`                        | `0`        | Additional vertical text offset.                     |
| `style`   | `Record<string, string>`        | –          | Extra SVG text attributes (e.g. `{ fill: '#333' }`). |

---

## AxisOptions

Applies to both `xAxis` and `yAxis`. A **category axis** is used when
`categories` is present (or `type: 'category'`); otherwise a **value axis**
(`linear` or `log`).

| Key                      | Type                                            | Default      | Description                                                                                                                                        |
| ------------------------ | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visible`                | `boolean`                                       | `true`       | When `false`, nothing is drawn and **no space is reserved** for the axis.                                                                          |
| `opposite`               | `boolean`                                       | `false`      | Move the axis to the opposite side: **y → right**, **x → top**. For a nested x-axis this triggers the [split layout](#nested-hierarchical-x-axis). |
| `categories`             | `string[]`                                      | –            | Category labels; makes this a categorical axis.                                                                                                    |
| `type`                   | `'linear' \| 'log' \| 'category' \| 'datetime'` | inferred     | Scale type.                                                                                                                                        |
| `title`                  | [`AxisTitleOptions`](#axis-titles)              | –            | Axis title and its placement.                                                                                                                      |
| `min`                    | `number`                                        | data min     | Force the axis minimum (value axes).                                                                                                               |
| `max`                    | `number`                                        | data max     | Force the axis maximum (value axes).                                                                                                               |
| `tickCount`              | `number`                                        | `4`          | Approximate number of ticks (linear axes).                                                                                                         |
| `labels`                 | [`AxisLabelOptions`](#axis-labels)              | enabled      | Tick label config.                                                                                                                                 |
| `gridLineWidth`          | `number`                                        | `1`          | Major grid line thickness (value axis). `0` hides major grid lines.                                                                                |
| `gridLineColor`          | `string`                                        | `'#e6e6e6'`  | Major grid line colour.                                                                                                                            |
| `gridLineDashStyle`      | `string`                                        | –            | Major-grid SVG dash array, for example `'6 3'`.                                                                                                    |
| `alternateGridColor`     | `string`                                        | –            | On a category axis, shade the second, fourth, etc. category bands across the plot with this colour.                                                |
| `minorTickInterval`      | `number \| 'auto'`                              | –            | Enables minor grid lines. A number uses axis units; `'auto'` divides each major interval into fifths.                                              |
| `minorGridLineWidth`     | `number`                                        | `1`          | Minor grid line thickness once enabled. `0` hides minor grid lines.                                                                                |
| `minorGridLineColor`     | `string`                                        | major colour | Minor grid line colour.                                                                                                                            |
| `minorGridLineDashStyle` | `string`                                        | `'2 2'`      | Minor-grid SVG dash array.                                                                                                                         |
| `lineColor`              | `string`                                        | `'#ccd6eb'`  | Axis line colour.                                                                                                                                  |
| `lineWidth`              | `number`                                        | `1`          | Axis line thickness. `0` hides the axis line.                                                                                                      |
| `plotLines`              | [`PlotLineOptions[]`](#plotlineoptions)         | –            | Reference lines at fixed values.                                                                                                                   |
| `plotBands`              | [`PlotBandOptions[]`](#plotbandoptions)         | –            | Shaded value bands.                                                                                                                                |
| `reversed`               | `boolean`                                       | `false`      | Reverse the axis direction.                                                                                                                        |
| `startOnZero`            | `boolean`                                       | –            | Force a value axis to include zero.                                                                                                                |
| `dimension`              | `string`                                        | –            | Bind this axis to a data field for [trellis](#trellisoptions) splitting.                                                                           |
| `dimensions`             | `string[]`                                      | –            | Two or more fields → [nested hierarchical x-axis](#nested-hierarchical-x-axis).                                                                    |
| `aggregate`              | `'sum' \| 'avg' \| 'count' \| 'min' \| 'max'`   | `'sum'`      | Aggregation used to collapse points into nested-axis leaves.                                                                                       |

### Axis labels

`AxisOptions.labels`:

| Key            | Type                    | Default      | Description                                                                                                                                                         |
| -------------- | ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`               | `true`       | Show tick labels. Set `false` to hide labels but keep the axis line.                                                                                                |
| `format`       | `string`                | `'{value}'`  | Token string; `{value}` is the tick value. Accepts format specs / dates — see [Text & label formatting](#text--label-formatting).                                   |
| `formatter`    | `(value) => string`     | –            | Custom label function (overrides `format`).                                                                                                                         |
| `rotation`     | `number`                | `0`          | Rotate tick labels by this angle (degrees), e.g. `-45` or `-90` for long/crowded categories. Labels are anchored to their tick and the axis band grows to fit them. |
| `autoRotation` | `number[]`              | `[0]`        | Candidate rotations tried in order when horizontal category labels overlap.                                                                                         |
| `step`         | `number`                | auto         | Draw every Nth label; collision handling may increase it.                                                                                                           |
| `maxWidth`     | `number`                | –            | Maximum measured label width in pixels.                                                                                                                             |
| `overflow`     | `'ellipsis' \| 'hide'`  | `'ellipsis'` | Truncate or hide labels wider than `maxWidth`.                                                                                                                      |
| `position`     | `'outer' \| 'inner'`    | `'outer'`    | Non-inverted polar x-axis: place labels outside the plot or curve them around the centre-hole radius.                                                               |
| `offset`       | `number`                | contextual   | Gap from the axis line. Cartesian default is `0`; polar x-axis defaults are 7 for inner, 10 for outer, and 6 beside an inverted radial axis.                         |
| `style`        | `Record<string,string>` | –            | Extra text attributes.                                                                                                                                              |

### Axis titles

`AxisOptions.title` supports `text`, `enabled`, `style`, and:

| Key        | Type                           | Default    | Description                                                          |
| ---------- | ------------------------------ | ---------- | -------------------------------------------------------------------- |
| `align`    | `'start' \| 'center' \| 'end'` | `'center'` | Position along the axis.                                             |
| `margin`   | `number`                       | auto       | Gap between tick labels and the title.                               |
| `offset`   | `number`                       | `0`        | Additional distance away from the plot.                              |
| `position` | `'outer' \| 'center'`          | `'outer'`  | Polar x-axis only: place the title below the frame or in its centre. |

For two axes, configure an array and bind the series by zero-based index.
`yAxis[1].opposite: true` explicitly places the second axis on the right;
`false` places it on the left. The same convention places an x-axis at the
top (`true`) or bottom (`false`).

### PlotLineOptions

A reference line drawn across the plot (x-axis → vertical, y-axis → horizontal).

| Key         | Type                                       | Default      | Description                                                                                                                                                                                                              |
| ----------- | ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value`     | `number \| string`                         | **required** | Axis value the line crosses.                                                                                                                                                                                             |
| `color`     | `string`                                   | `'#e63946'`  | Line colour.                                                                                                                                                                                                             |
| `width`     | `number`                                   | `1.5`        | Line thickness.                                                                                                                                                                                                          |
| `dashStyle` | `string`                                   | –            | SVG dash array, e.g. `'4 3'`.                                                                                                                                                                                            |
| `zIndex`    | `'above' \| 'below'`                       | `'below'`    | Stacking order relative to the series. `'below'` draws the line as part of the axis, under the series (a tall bar/area can hide it). `'above'` draws it in a separate pass after the series, so it stays visible on top. |
| `label`     | `{ text; align?; verticalAlign?; color? }` | –            | Optional inline label (see below).                                                                                                                                                                                       |

**`label.align`** (`'left' \| 'center' \| 'right'`) — horizontal position along the
line. For a y-axis (horizontal) line, it's where along the line's length the
label sits (default: an automatic side pick clamped to the plot edge). For an
x-axis (vertical) line, it's which side of the line the label sits on
(`'center'` places it directly on the line).

**`label.verticalAlign`** (`'above' \| 'below'`, default `'above'`) — position
relative to the line. For a y-axis (horizontal) line this hugs the line
itself. An x-axis (vertical) line has no "above/below the line" (it spans the
full plot height), so this instead places the label near the top or bottom of
the plot.

```ts
yAxis: {
  plotLines: [{
    value: 100, color: '#e63946', zIndex: 'above',
    label: { text: 'target', align: 'left', verticalAlign: 'below' },
  }],
}
```

### PlotBandOptions

A shaded band spanning an axis interval.

| Key     | Type                       | Default                 | Description       |
| ------- | -------------------------- | ----------------------- | ----------------- |
| `from`  | `number \| string`         | **required**            | Band start value. |
| `to`    | `number \| string`         | **required**            | Band end value.   |
| `color` | `string`                   | `rgba(70,130,180,0.12)` | Fill colour.      |
| `label` | `{ text; align?; color? }` | –                       | Optional label.   |

```ts
yAxis: {
  plotBands: [{ from: 5, to: 7, color: 'rgba(0,200,120,0.1)', label: { text: 'target' } }],
  plotLines: [{ value: 6, color: '#e63946', dashStyle: '5 4', label: { text: 'goal' } }],
}
```

---

## SeriesOptions

One object per series in the `series` array.

| Key              | Type                                                      | Default       | Description                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | [`PointInput[]`](#point-data-formats)                     | **required**  | The data points.                                                                                                                                                                                                                                |
| `type`           | [`ChartType`](#chart-types)                               | `chart.type`  | Series type; enables combination charts.                                                                                                                                                                                                        |
| `name`           | `string`                                                  | –             | Series name (legend, tooltip).                                                                                                                                                                                                                  |
| `color`          | `string`                                                  | palette       | Series colour.                                                                                                                                                                                                                                  |
| `visible`        | `boolean`                                                 | `true`        | Initial visibility (toggled via the legend).                                                                                                                                                                                                    |
| `showInLegend`   | `boolean`                                                 | `true`        | Set to `false` to omit this series from the chart legend.                                                                                                                                                                                       |
| `stack`          | `string \| number`                                        | –             | Series sharing a stack id pile together.                                                                                                                                                                                                        |
| `stacking`       | `'normal' \| 'percent'`                                   | –             | Enable stacking (`percent` = 100% stacked).                                                                                                                                                                                                     |
| `grouping`       | `boolean`                                                  | `true`        | Set `false` on a column/bar/tick series to draw it across the full category band instead of its own side-by-side slot, overlapping other `grouping: false` series — see [Overlapping bars](#chart-types).                                     |
| `borderRadius`   | `number`                                                   | `0`           | Corner radius (px) for a column/bar's outer end, flush at the baseline — see [Rounded bar corners](#chart-types).                                                                                                                              |
| `startAngle`     | `number`                                                   | `-90`         | Radial-bar arc start in degrees; `-90` is 12 o'clock.                                                                                                                                                                                           |
| `endAngle`       | `number`                                                   | `180`         | Radial-bar arc end in degrees. Use `90` with the default start for a half circle.                                                                                                                                                               |
| `xAxis`          | `0 \| 1`                                                  | `0`           | Bound x-axis. `1` uses the secondary x-axis, drawn at the top with its own categories/domain.                                                                                                                                                   |
| `yAxis`          | `0 \| 1`                                                  | `0`           | Bound y-axis. `1` = secondary axis, drawn on the right with its own scale — pass `yAxis` (top-level) as a 2-element array to configure it. Works with a plain categorical x-axis or a [nested one](#nested-hierarchical-x-axis).                |
| `lineWidth`      | `number`                                                  | `2`           | Stroke width (line/area/range).                                                                                                                                                                                                                 |
| `innerSize`      | `string`                                                  | –             | Pie inner radius, e.g. `'60%'` (makes a donut).                                                                                                                                                                                                 |
| `centerLabel`    | [`PieCenterLabelOptions`](#piecenterlabeloptions)         | enabled       | Hovered slice value displayed in the hollow centre of a donut or pie with `innerSize`.                                                                                                                                                          |
| `dimensions`     | `string[]`                                                | –             | Pie/donut **two-dimension** rings — see [Multi-level pie](#multi-level-two-dimension-pie).                                                                                                                                                      |
| `marker`         | [`MarkerOptions`](#markeroptions)                         | –             | Point markers (line/area/scatter/arearange). Range series (`arearange`/`areasplinerange`) show them at both the low and high end by default — set `enabled: false` to hide them (points stay hoverable via an invisible hit target either way). |
| `dataLabels`     | [`DataLabelOptions`](#datalabeloptions)                   | disabled      | On-chart value labels.                                                                                                                                                                                                                          |
| `jitter`         | `number`                                                  | `0.5`         | Horizontal spread (in band widths) for `jitter` charts.                                                                                                                                                                                         |
| `states`         | `{ hover?: `[`HoverStateOptions`](#hoverstateoptions)` }` | –             | Interaction states.                                                                                                                                                                                                                             |
| `tooltip`        | [`SeriesTooltipOptions`](#tooltipoptions)                 | –             | Per-series tooltip overrides.                                                                                                                                                                                                                   |
| `boxColors`      | [see below](#boxplot-options)                             | –             | Boxplot colours.                                                                                                                                                                                                                                |
| `outlierMarker`  | [`MarkerOptions`](#markeroptions)                         | hollow circle | Boxplot outlier marker styling — see point-level `outliers`.                                                                                                                                                                                    |
| `lowColor`       | [see below](#dumbbell-options)                            | series colour | Dumbbell low-end marker colour.                                                                                                                                                                                                                 |
| `highColor`      | [see below](#dumbbell-options)                            | series colour | Dumbbell high-end marker colour (also the legend swatch).                                                                                                                                                                                       |
| `connectorColor` | [see below](#dumbbell-options)                            | `'#b0b0b0'`   | Dumbbell connector line colour.                                                                                                                                                                                                                 |
| `connectorWidth` | [see below](#dumbbell-options)                            | `3`           | Dumbbell connector thickness.                                                                                                                                                                                                                   |

Any extra keys you add to a series or point are preserved and surfaced back in
tooltips and event payloads.

**Secondary y-axis (dual axis).** Works with a plain categorical x-axis too —
not just [nested](#nested-hierarchical-x-axis) — for the common "bars +
line on a differently-scaled axis" combo:

```ts
xAxis: { categories: months },
yAxis: [ { title: { text: 'Units' } }, { title: { text: 'Margin %' } } ],
series: [
  { type: 'column', name: 'Units', data: unitsRow },
  { type: 'spline', name: 'Margin %', yAxis: 1, data: marginRow },  // → right axis, own scale
],
```

### Boxplot options

`SeriesOptions.boxColors` — set `lower`/`upper` to two **distinct hues** for a
split-colour box, or leave unset for two shades of the series colour.

| Key       | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `lower`   | `string` | Fill for the q1→median half. |
| `upper`   | `string` | Fill for the median→q3 half. |
| `median`  | `string` | Median line colour.          |
| `whisker` | `string` | Whisker/cap colour.          |
| `border`  | `string` | Box outline colour.          |

Boxplots render **horizontally** when `chart.inverted` is set, and multiple
boxplot series **group** side-by-side within each category.

Both `boxColors` and `outlierMarker` can also be set on an individual **point**
to override that series' (or `plotOptions.boxplot`'s) value for just that one
box — see [Resolution order](#plotoptions):

```ts
plotOptions: {
  boxplot: { boxColors: { border: '#888' } },   // every boxplot series
},
series: [{
  type: 'boxplot',
  boxColors: { lower: '#74c0fc' },              // this series' boxes
  data: [
    { min: 2, q1: 4, median: 5, q3: 6.5, max: 8 },                       // border: #888 (plotOptions), lower: #74c0fc (series)
    { min: 1, q1: 3, median: 4, q3: 6, max: 9, boxColors: { upper: '#f08c4b' } }, // upper overridden for this box only
  ],
}]
```

**Outliers.** Give a point `outliers: number[]` for values that fall outside
the whiskers; each renders as a small hollow marker positioned above/below
that point's own box — not the shared category centre — so grouped boxplots
keep every series' outliers over their own box:

```ts
series: [
  {
    type: "boxplot",
    data: [
      { min: 2, q1: 4, median: 5, q3: 6.5, max: 8, outliers: [10.5, 11, -2] },
    ],
  },
];
```

Outlier values also extend the value axis domain, and are listed in the
default tooltip. Style them via `SeriesOptions.outlierMarker` (`radius`,
`symbol`, `fillColor`, `lineColor`, `lineWidth`).

### Dumbbell options

| Key              | Type     | Default       | Description                                      |
| ---------------- | -------- | ------------- | ------------------------------------------------ |
| `lowColor`       | `string` | series colour | Low-end marker colour.                           |
| `highColor`      | `string` | series colour | High-end marker colour (also the legend swatch). |
| `connectorColor` | `string` | `'#b0b0b0'`   | Connector line colour.                           |
| `connectorWidth` | `number` | `3`           | Connector line thickness.                        |

All four can also be set on an individual **point** to override that series'
(or `plotOptions.dumbbell`'s) value for just that one connector — see
[Resolution order](#plotoptions):

```ts
plotOptions: {
  dumbbell: { connectorColor: '#999', connectorWidth: 2 },  // every dumbbell series
},
series: [{
  type: 'dumbbell',
  lowColor: 'orange',                     // this series' low-end markers
  data: [
    { low: 2, high: 8 },                              // connector from plotOptions, low from series
    { low: 3, high: 7, highColor: 'green' },          // high overridden for this point only
  ],
}]
```

### Gauge options

A gauge series renders one 180° dial for every point in `data`. Dials are
arranged left-to-right by default and top-to-bottom with
`chart.inverted: true`. Values outside `min`–`max` are clamped when rendered.

| Key               | Type                                          | Default             | Description                                                          |
| ----------------- | --------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `min`             | `number`                                      | `0`                 | Lower end of every dial in the series.                               |
| `max`             | `number`                                      | `100`               | Upper end of every dial in the series.                               |
| `minLabel`        | `string`                                      | `0`                 | Lower end of every dial in the series.                               |
| `maxLabel`        | `string`                                      | `100`               | Upper end of every dial in the series.                               |
| `color`           | `string`                                      | series palette      | Value-band colour. A point-level `color` overrides it for that dial. |
| `trackColor`      | `string`                                      | theme grid colour   | Background-track colour.                                             |
| `trackOpacity`    | `number`                                      | `0.15`              | Background-track opacity.                                            |
| `thickness`       | `number`                                      | adaptive, about 18% | Band thickness in pixels, capped to fit small dials.                 |
| `markers`         | [`GaugeMarkerOptions[]`](#gaugemarkeroptions) | –                   | Reference lines and labels drawn on every dial in the series.        |
| `showMinMax`      | `boolean`                                     | `true`              | Show the minimum and maximum labels beneath the two band ends.       |
| `centerFormatter` | `(value: number) => string`                   | `String(value)`     | Formats each dial's centre value.                                    |
| `centerFontSize`  | `string`                                      | adaptive, 10–22 px  | CSS centre-value font size, e.g. `'20px'`. Scales with chart size.   |

#### GaugeMarkerOptions

| Key             | Type                    | Default           | Description                                                       |
| --------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `value`         | `number`                | **required**      | Position on the dial; values outside the gauge range are clamped. |
| `label`         | `string`                | marker value      | Marker label text.                                                |
| `color`         | `string`                | value-band colour | Marker line and label colour.                                     |
| `labelPosition` | `'outside' \| 'inside'` | `'outside'`       | Places the label outside the track or inside the value band.      |
| `fontSize`      | `string`                | `'10px'`          | CSS marker-label font size, e.g. `'14px'`. Scales with chart size.|

Defaults can be set through `plotOptions.gauge`; an explicit series value
replaces the plot-level value:

```ts
plotOptions: {
  gauge: {
    color: '#26a69a',
    markers: [
      { value: 80, label: 'Target', fontSize: '12px' },
    ],
  },
},
series: [{
  type: 'gauge',
  min: 0,
  max: 100,
  data: [
    { name: 'API', y: 86 },
    { name: 'Workers', y: 74, color: '#f59e0b' },
  ],
}]
```

### MarkerOptions

| Key         | Type                                                             | Default                                          | Description          |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------ | -------------------- |
| `enabled`   | `boolean`                                                        | `false` (line/area), `true` (scatter, arearange) | Show markers.        |
| `radius`    | `number`                                                         | `4`                                              | Marker radius.       |
| `symbol`    | `'circle' \| 'square' \| 'diamond' \| 'triangle' \| 'rectangle'` | `'circle'`                                       | Marker shape.        |
| `fillColor` | `string`                                                         | series colour                                    | Marker fill.         |
| `lineColor` | `string`                                                         | `'#fff'`                                         | Marker border.       |
| `lineWidth` | `number`                                                         | `1`                                              | Marker border width. |
| `width`     | `number`                                                         | `4`                                              | Marker width.        |
| `height`    | `number`                                                         | `4`                                              | Marker height.       |

### DataLabelOptions

On-chart value labels; supported on column/bar/tick, line/area/spline/step,
scatter/jitter, pie/donut and butterfly.

| Key               | Type                            | Default        | Description                                                                                                                                                                                 |
| ----------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | `boolean`                       | `false`        | Show labels.                                                                                                                                                                                |
| `format`          | `string`                        | `'{y}'`        | Token string with tokens/specs — `{x}`, `{y}`, `{name}`, `{series}`, `{percentage}`, `{total}`, `{point.<field>}`, e.g. `{y:,.1f}`. See [Text & label formatting](#text--label-formatting). |
| `formatter`       | `(ctx: LabelContext) => string` | –              | Custom label function (overrides `format`).                                                                                                                                                 |
| `color`           | `string`                        | theme          | Text colour.                                                                                                                                                                                |
| `fontSize`        | `string`                        | `'11px'`       | Font size.                                                                                                                                                                                  |
| `fontWeight`      | `string`                        | –              | e.g. `'600'`.                                                                                                                                                                               |
| `align`           | `'left' \| 'center' \| 'right'` | natural        | Horizontal text alignment relative to the resolved label position.                                                                                                                         |
| `position`        | see below                       | type-dependent | Where the label sits.                                                                                                                                                                       |
| `distance`        | `number`                        | `0`            | Extra offset in the label's natural direction.                                                                                                                                              |
| `rotation`        | `number`                        | `0`            | Rotate the text.                                                                                                                                                                            |
| `backgroundColor` | `string`                        | –              | Draw a background chip behind the label.                                                                                                                                                    |

**`position` values by series family:**

| Family                | Values (default first)                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| column / bar          | `outside`, `inside`, `center`, `base` — defaults to `center` for a stacked point instead, since `outside` (just past that point's own segment) sits inside whichever segment is stacked above it |
| line / area / scatter | `top`, `bottom`, `center`, `left`, `right`                                                                                                                                                       |
| pie / donut           | adaptive inside-first (default), `inside` (same adaptive behaviour), `outside` (forced)                                                                                                         |

`LabelContext` (passed to `formatter`): `{ x, y, point, series }`.

### PieCenterLabelOptions

Controls the value shown in the hollow centre while a donut sector is hovered
or keyboard-focused. It also applies to pie series configured with `innerSize`.

| Key          | Type                            | Default  | Description                                                            |
| ------------ | ------------------------------- | -------- | ---------------------------------------------------------------------- |
| `enabled`    | `boolean`                       | `true`   | Show the centre value when the chart has a hollow centre.              |
| `format`     | `string`                        | `'{y}'`  | Supports `{name}`, `{y}`, `{percentage}`, `{total}`, and format specs. |
| `formatter`  | `(ctx: LabelContext) => string` | –        | Custom text callback; overrides `format`.                              |
| `color`      | `string`                        | theme    | Text colour.                                                           |
| `fontSize`   | `string`                        | adaptive | CSS font size such as `'20px'`.                                        |
| `fontWeight` | `string`                        | `'600'`  | CSS font weight.                                                       |
| `fontFamily` | `string`                        | theme    | CSS font family.                                                       |

### Multi-level (two-dimension) pie

Give a pie/donut series two field names in `dimensions` to render concentric
rings: the **inner** ring groups by the first field (labelled inside), the
**outer** ring breaks each group down by the second field (shaded variants of the
parent colour, with the same adaptive labels). The legend lists the inner groups
and toggling one hides its whole wedge.

```ts
{
  chart: { type: 'donut' },
  series: [{
    dimensions: ['Region', 'Device'],   // inner ▸ outer
    innerSize: '35%',
    data: [
      { Region: 'Americas', Device: 'Mobile',  y: 30 },
      { Region: 'Americas', Device: 'Desktop', y: 22 },
      { Region: 'EMEA',     Device: 'Mobile',  y: 24 },
      // …
    ],
    dataLabels: { enabled: true, format: '{name}' },
  }],
}
```

Pie/donut labels are placed inside their sector when the complete label fits.
Labels that do not fit automatically move outside and are joined to their slice
with a **leader line**, so the label↔slice mapping remains unambiguous. Use
`dataLabels.position: 'outside'` to force every label outside; `inside` retains
the adaptive inside-first behaviour.

### HoverStateOptions

`SeriesOptions.states.hover` — subtle brightness highlight by default; scaling is
opt-in.

| Key          | Type      | Default | Description                            |
| ------------ | --------- | ------- | -------------------------------------- |
| `enabled`    | `boolean` | `true`  | Enable hover highlight.                |
| `brightness` | `number`  | `0.08`  | Brightness increase ratio on hover.    |
| `scale`      | `number`  | –       | Optional scale multiplier, e.g. `1.1`. |

---

## TooltipOptions

| Key               | Type                              | Default | Description                                                                                                                                                                                                         |
| ----------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | `boolean`                         | `true`  | Show tooltips. Set `false` to disable globally.                                                                                                                                                                     |
| `format`          | `string`                          | –       | HTML token string: `{series}`, `{name}`, `{x}`, `{y}`, `{percentage}`, `{total}`, `{low}`, `{high}`, `{point.<field>}`, with format specs like `{y:$,.0f}`. See [Text & label formatting](#text--label-formatting). |
| `formatter`       | `(ctx: TooltipContext) => string` | –       | Custom HTML content (overrides `format`).                                                                                                                                                                           |
| `shared`          | `boolean`                         | `false` | Combine all points at an x into one tooltip.                                                                                                                                                                        |
| `backgroundColor` | `string`                          | –       | Tooltip background.                                                                                                                                                                                                 |
| `borderColor`     | `string`                          | –       | Tooltip border.                                                                                                                                                                                                     |
| `valuePrefix`     | `string`                          | –       | Prepended to numeric values.                                                                                                                                                                                        |
| `valueSuffix`     | `string`                          | –       | Appended to numeric values.                                                                                                                                                                                         |
| `valueDecimals`   | `number`                          | –       | Fixed decimal places.                                                                                                                                                                                               |

`SeriesTooltipOptions` is the subset `{ format, formatter, valuePrefix,
valueSuffix, valueDecimals }`, settable per series.

`TooltipContext` (passed to `formatter`):
`{ series, x, y, name?, index?, percentage?, total?, low?, high?, box?, point,
color, points? }` — `box` is the five-number summary for boxplots; `points` is
present when `shared` is on.

Boxplot and range series get sensible default multi-line tooltips automatically.

---

## Text & label formatting

Every `format` string (data labels, tooltips, and axis labels) runs through the
same token engine. A token is `{path}` or `{path:spec}`.

**Tokens** — `{x}`, `{y}`, `{name}`, `{series}`, `{index}`, `{color}`,
`{percentage}`, `{total}`, `{low}`, `{high}`, and any `{point.<field>}` (dotted
paths supported). Tooltips also expose `{yFormatted}` (value with the tooltip's
prefix/suffix/decimals already applied).

**Number format spec** — `[prefix][,][.decimals][type][suffix]`:

| Spec        | Input     | Output                |
| ----------- | --------- | --------------------- |
| `{y:,.0f}`  | `1234.5`  | `1,235`               |
| `{y:.2f}`   | `3.14159` | `3.14`                |
| `{y:.1%}`   | `0.1234`  | `12.3%`               |
| `{y:$,.2f}` | `1234567` | `$1,234,567.00`       |
| `{y:.2s}`   | `1234567` | `1.23M` (SI: k/M/B/T) |
| `{y:€,.0f}` | `1500`    | `€1,500`              |
| `{y:d}`     | `42.7`    | `43`                  |

Type chars: `f` fixed · `%` percent (×100) · `s` SI-abbreviated · `e`
exponential · `d` integer. `,` adds a thousands separator; anything before the
number is a literal prefix, anything after is a literal suffix.

**Date spec** — when the spec contains `%` tokens the value is treated as a
`Date`/timestamp: `{x:%Y-%m-%d}`, `{x:%b %d}`, `{value:%H:%M}`. Tokens: `%Y %y
%m %b %B %d %e %H %M %S %a %A`.

```ts
yAxis:  { labels: { format: '${value:,.0f}' } },          // $1,000,000
series: [{
  dataLabels: { enabled: true, format: '{y:$,.1s} ({percentage:.0f}%)' },  // $1.3M (15%)
  tooltip: { format: '<b>{name}</b><br/>{y:$,.0f} — {percentage:.1f}% of {total:$,.2s}' },
}],
```

The helpers are exported for standalone use:
`formatString`, `formatValue`, `formatNumber`, `formatDate`, `abbreviateNumber`,
`groupThousands`.

---

## LegendOptions

| Key             | Type                            | Default        | Description                                                                    |
| --------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `enabled`       | `boolean`                       | `true`         | Show the legend.                                                               |
| `layout`        | `'horizontal' \| 'vertical'`    | `'horizontal'` | `horizontal` → strip at top/bottom; `vertical` → column at left/right.         |
| `verticalAlign` | `'top' \| 'bottom'`             | `'bottom'`     | Placement for a horizontal legend.                                             |
| `align`         | `'left' \| 'center' \| 'right'` | `'center'`     | Horizontal alignment, or the side for a vertical legend.                       |
| `margin`        | `number`                        | contextual     | Gap between the legend and adjacent chart content.                             |
| `padding`       | `number`                        | `0`            | Padding around the legend items.                                               |
| `offsetX`       | `number`                        | `0`            | Horizontal translation after layout; does not change reserved space.           |
| `offsetY`       | `number`                        | `0`            | Vertical translation after layout; does not change reserved space.             |
| `symbolPadding` | `number`                        | `6`            | Gap between each colour symbol and its label.                                  |
| `itemGap`       | `number`                        | `18`           | Gap after each item in a horizontal legend.                                    |
| `rowGap`        | `number`                        | `6`            | Gap between horizontal rows or vertically stacked items.                       |
| `itemStyle`     | `Record<string,string>`         | –              | Extra item text attributes.                                                    |

The full-size contextual `margin` defaults are `10` for a top legend, `22` for
a bottom legend, and `8` for a left/right legend. With `chart.responsive` on,
these defaults taper on constrained charts; an explicit `margin` never tapers.

**Placement matrix**

| Want             | Config                                   |
| ---------------- | ---------------------------------------- |
| Bottom (default) | `{}`                                     |
| Top              | `{ verticalAlign: 'top' }`               |
| Right            | `{ layout: 'vertical', align: 'right' }` |
| Left             | `{ layout: 'vertical', align: 'left' }`  |

Clicking a legend item toggles that series (or, for pie/donut/radialbar, that
slice) — re-rendering with the value re-distributed.

---

## Theming

Set `theme` to a built-in name or a custom object. Explicit `colors`,
`chart.backgroundColor`, and per-axis colours always override the theme.

**Built-in themes:** `'light'` (default), `'dark'`, `'high-contrast'`, `'pastel'`.

```ts
{ theme: 'light', series: [...] } // explicit light theme
{ theme: 'dark', series: [...] }
```

**Custom theme** — pass a partial `Theme`, optionally extending a built-in via `base`:

```ts
{
  theme: {
    base: 'dark',                                  // start from a built-in
    backgroundColor: '#0b1021',
    colors: ['#00f5d4', '#f15bb5', '#fee440'],     // series palette
    axis: { gridLineColor: '#1c2540', labelColor: '#8ea2c6' },
  },
}
```

A `Theme` has these tokens (all optional in a custom object):

| Token             | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `colors`          | `string[]` categorical series palette.                  |
| `backgroundColor` | Chart background.                                       |
| `fontFamily`      | Font stack for all text.                                |
| `title`           | `{ color, fontSize, fontWeight }`.                      |
| `subtitle`        | `{ color, fontSize }`.                                  |
| `axis`            | `{ labelColor, titleColor, lineColor, gridLineColor }`. |
| `dataLabel`       | `{ color }`.                                            |
| `legend`          | `{ color, hiddenColor }`.                               |
| `tooltip`         | `{ backgroundColor, borderColor, color }`.              |
| `neutralColor`    | Muted colour for connectors / neutral marks.            |

Register a reusable named theme at runtime:

```ts
import { registerTheme, LIGHT_THEME } from "facetviz";
registerTheme("corp", {
  ...LIGHT_THEME,
  colors: ["#003f5c", "#bc5090", "#ffa600"],
});
// then: { theme: 'corp' }
```

## PlotOptions

Defaults merged into every series, or into every series of one type:

```ts
plotOptions: {
  series: { dataLabels: { enabled: true } },  // all series
  column: { stacking: 'normal' },             // only column series
}
```

Keys are `'series'` or any [`ChartType`](#chart-types); values are partial
[`SeriesOptions`](#seriesoptions).

**Resolution order.** For any option a series or point reads, the most specific
value wins:

1. The **point's own option** (a field on that `data` entry), if set.
2. The **series' option** (a field on that `series` entry), if set.
3. **`plotOptions[type]`**, then **`plotOptions.series`**, if set.
4. The chart's **built-in default**.

Not every field supports a point-level override (most series-wide settings —
`stacking`, `dataLabels`, `marker`, etc. — only make sense per series), but
per-point styling knobs do: boxplot's `boxColors`/`outlierMarker` and
dumbbell's `lowColor`/`highColor`/`connectorColor`/`connectorWidth` can all be
set on an individual point to override that series' (or `plotOptions`') value
for just that one point. See [Boxplot options](#boxplot-options) and
[Dumbbell options](#dumbbell-options).

---

## TrellisOptions

Splits one dataset into a grid of panels (small multiples) by data fields.

| Key       | Type      | Default   | Description                                                                         |
| --------- | --------- | --------- | ----------------------------------------------------------------------------------- |
| `columns` | `string`  | –         | Field whose values become grid columns.                                             |
| `rows`    | `string`  | –         | Field whose values become grid rows.                                                |
| `gap`     | `number`  | `14`/`24` | Gap in px between panels.                                                           |
| `table`   | `boolean` | `true`    | `true` → cross-tab table (shared axes, headers once); `false` → independent panels. |
| `sharedX` | `boolean` | `true`    | Share the x scale across panels.                                                    |
| `sharedY` | `boolean` | `true`    | Share the y scale across panels.                                                    |

```ts
trellis: { columns: 'category', rows: 'region' },
series: [{ name: 'Sales', data: rows /* each point has category & region fields */ }],
```

### Nested (hierarchical) x-axis

Put multiple dimensions on one x-axis; the measure (`y`) is aggregated per leaf:

```ts
xAxis: { dimensions: ['Region', 'Category'], aggregate: 'sum', opposite: true },
```

- Default: all dimension tiers stack below the plot.
- `opposite: true` → **split** layout: the innermost dimension is labelled at the
  bottom, outer grouping dimensions move to the top, and full-height lines
  separate each top-level group (the classic nested-columns look).
- A `line`/`area`-type series on a nested axis is drawn as one segment **per
  first-dimension group** (it does not run continuously across group boundaries),
  so a column+line combo reads correctly.

On a nested x-axis specifically, this also combines with a secondary y-axis
(below) for a "combo chart with two differently-scaled measures" look:

```ts
xAxis: { dimensions: ['Region', 'Category'], aggregate: 'sum' },
yAxis: [ { title: { text: 'Sum of Sales' } }, { title: { text: 'Margin %' } } ],
series: [
  { name: 'Sales', data: rows },
  { type: 'spline', name: 'Margin %', yAxis: 1, data: marginRows },  // → right axis
],
```

### Trellis combo (multiple series per cell)

The trellis table renders **every** series in each cell, so combination charts
work out of the box — mix series `type`s and they share the cell's axes:

```ts
trellis: { columns: 'category', rows: 'region' },
series: [
  { type: 'column', name: 'Sales', data: rows },
  { type: 'spline', name: 'Trend', data: rows },
],
```

To split by a dimension **down the y** (nested rows), use `trellis.rows`
— each dimension value becomes a horizontal band sharing the y-axis.

### Axis titles and secondary y-axis

`yAxis.title` renders next to each row's axis (rotated, to the left of that
row's tick labels), the same convention as the tick labels themselves. A
secondary y-axis works the same way it does elsewhere: series bound via
`yAxis: 1` get their own shared scale and a labelled axis on the right, with
`yAxis[1].title` drawn per row on that side:

```ts
trellis: { columns: 'category', rows: 'region' },
yAxis: [ { title: { text: 'Sales' } }, { title: { text: 'Margin %' } } ],
series: [
  { type: 'column', name: 'Sales', data: rows },
  { type: 'spline', name: 'Margin %', yAxis: 1, data: marginRows },  // → right axis, own scale
],
```

---

## Annotations

Annotations use axis values, so they stay attached to the data across resizing,
axis-domain changes, and polar projection:

```ts
annotations: [
  {
    x: "March",
    y: 120,
    text: "Campaign launched",
    shape: "callout",
    dx: 18,
    dy: -24,
  },
];
```

`shape` is `'label'`, `'callout'`, or `'circle'`. Use `xAxis` / `yAxis` (`0`
or `1`) for a secondary scale, `zIndex: 'below'` to place an annotation under
the series, and `color`, `backgroundColor`, `borderColor`, `borderWidth`,
`padding`, `radius`, and `style` for appearance.

## Chart text

Use `texts` for labels that belong to the chart rather than to a data value.
Choose a chart edge or centre with alignment, then adjust it with offsets:

```ts
texts: [
  {
    text: "Draft\nInternal only",
    align: "center",
    verticalAlign: "center",
    offsetX: 8,
    offsetY: -4,
    rotation: -12,
    color: "#475569",
    style: { fontSize: "18px", fontWeight: "600", opacity: "0.7" },
  },
];
```

`align` supports `'left'`, `'center'`, and `'right'`; `verticalAlign` supports
`'top'`, `'center'`, and `'bottom'`. Together they select the chart anchor.
`offsetX` and `offsetY` are then added in pixels. For example, right/bottom
alignment with offsets of `-16` places text 16 pixels inside the bottom-right
corner.

Text can contain newlines. Customize a block with `color`, `style`,
`lineHeight`, `rotation`, and `className`. Set `enabled: false` to retain but
hide a block. Chart text is always drawn above the chart content.

## Responsive rules

Rules are deep-merged for a matching render and restored afterwards, leaving
`chart.options` unchanged:

```ts
responsive: [
  {
    condition: { maxWidth: 480 },
    options: {
      legend: { enabled: false },
      title: { margin: 4 },
      xAxis: {
        labels: { autoRotation: [0, -45, -90], maxWidth: 72 },
      },
    },
  },
];
```

Conditions support `minWidth`, `maxWidth`, `minHeight`, and `maxHeight`.
Responsive options cover chart layout, titles, axes, tooltip, legend, trellis,
annotations, chart text, and accessibility. They intentionally do not replace series data
or validation configuration.

## General polar charts

Set `chart.polar: true` on `line`, `spline`, `step`, `area`, `areaspline`,
`scatter`, `jitter`, `column`, or `dumbbell` charts:

```ts
{
  chart: {
    type: 'column',
    polar: true,
    polarInnerSize: '44%',
    polarInnerBackgroundColor: '#fff',
    polarGridLineMode: 'sector'
  },
  xAxis: {
    categories: ['North', 'East', 'South', 'West'],
    labels: { position: 'inner', offset: 10 },
    title: { text: 'Direction', position: 'center' }
  },
  yAxis: { title: { text: 'Revenue' } },
  series: [{ data: [4, 7, 5, 8] }]
}
```

These use a shared angular x-axis and radial y-axis. Existing tooltips, point
events, stacking, grouping, labels, annotations, legends, and secondary radial
scales continue to apply. `polarInnerSize` maps the radial scale outside the
centre hole, so columns and areas begin at its edge and grid spokes do not cross
it. Set `polarGridLineMode: 'sector'` to shift angular dividers from category
centres to category boundaries, outlining each wedge while keeping its label
centred. `xAxis.labels.position: 'inner'` curves category labels around the
centre-hole radius, while `xAxis.title.position: 'center'` places the title in
the middle of the hole.
Polar dumbbells place each low/high pair on one radial spoke, with grouped
series offset into separate angular slots.
Dedicated `radar`, `radialbar`, and `gauge` types keep their specialized
renderers and do not require `chart.polar`.

Set `chart.inverted: true` to swap the general polar coordinate roles:

```ts
{
  chart: { type: 'column', polar: true, inverted: true },
  xAxis: { categories: ['Inner', 'Middle', 'Outer'] },
  yAxis: { min: 0, max: 100 },
  series: [{ data: [35, 62, 84] }]
}
```

The x-axis is then radial, with its labels on a vertical radius, while the
y-axis is circular with value labels around the circumference. Columns become
concentric arc bars and dumbbell connectors become circular arcs.

---

## Events

Register callbacks in config, or subscribe via [`chart.on()`](#instance-methods).

**`ChartEvents`** (`chart.events`): `load(chart)`, `render(chart)`, `click(ev)`.

**`SeriesEvents`** (`seriesEvents`, applied to all series):
`click(ev)`, `mouseOver(ev)`, `mouseOut(ev)`, `legendItemClick({ series, visible })`.

**`FacetVizPointEvent`** (`ev`) payload:

| Field         | Type                  | Description                               |
| ------------- | --------------------- | ----------------------------------------- |
| `type`        | `string`              | `'click'` / `'mouseOver'` / `'mouseOut'`. |
| `seriesName`  | `string`              | Series name.                              |
| `seriesIndex` | `number`              | Series index.                             |
| `pointIndex`  | `number`              | Point index within the series.            |
| `x`           | `number \| string`    | Point x.                                  |
| `y`           | `number \| undefined` | Point y.                                  |
| `point`       | `PointOptions`        | Full point object (incl. custom fields).  |
| `domEvent`    | `Event`               | The originating DOM event.                |

```ts
seriesEvents: { click: (ev) => console.log(ev.seriesName, ev.x, ev.y) }
// or:
const off = chart.on('point:click', (ev) => { ... });
```

Emitted event names for `chart.on()`: `point:click`, `point:mouseOver`,
`point:mouseOut`, `render`.

---

## Point data formats

Each entry in `series.data` (`PointInput`) may be:

| Form             | Example                   | Meaning                                 |
| ---------------- | ------------------------- | --------------------------------------- |
| number           | `5`                       | y-value; x taken from index/categories. |
| `[x, y]`         | `['Jan', 5]`              | Explicit x and y.                       |
| `[x, low, high]` | `['Jan', 3, 8]`           | Range / dumbbell low & high.            |
| object           | `{ y: 5, color: '#f00' }` | Full [`PointOptions`](#pointoptions).   |
| `null`           | `null`                    | A gap (line/area).                      |

### PointOptions

| Key                                                      | Type                                      | Used by                              |
| -------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `x`                                                      | `number \| string`                        | all                                  |
| `y`                                                      | `number`                                  | most                                 |
| `low` / `high`                                           | `number`                                  | range, dumbbell                      |
| `min`/`q1`/`median`/`q3`/`max`                           | `number`                                  | boxplot                              |
| `outliers`                                               | `number[]`                                | boxplot (values beyond the whiskers) |
| `boxColors` / `outlierMarker`                            | see [Boxplot options](#boxplot-options)   | boxplot — per-point override         |
| `lowColor`/`highColor`/`connectorColor`/`connectorWidth` | see [Dumbbell options](#dumbbell-options) | dumbbell — per-point override        |
| `name`                                                   | `string`                                  | pie / categorical                    |
| `color`                                                  | `string`                                  | per-point colour (any series)        |
| _(custom)_                                               | `any`                                     | surfaced in tooltips & events        |

Use `computeBoxStats(values)` (exported) to derive the five-number summary from a
raw array for boxplots.

---

## Chart types

| Type                            | Description                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bar`                           | Horizontal bars.                                                                               |
| `column`                        | Vertical bars.                                                                                 |
| `line` / `spline` / `step`      | Line variants (straight / smoothed / stepped).                                                 |
| `area` / `areaspline`           | Filled line / smoothed filled line.                                                            |
| `arearange` / `areasplinerange` | Filled band between `low` and `high`.                                                          |
| `pie` / `donut`                 | Circular proportion (donut = `innerSize`).                                                     |
| `scatter` / `jitter`            | Point clouds (jitter adds horizontal spread).                                                  |
| `boxplot`                       | Five-number distribution; dual-colour, horizontal & groupable.                                 |
| `dumbbell`                      | Two connected points per category; horizontal & groupable.                                     |
| `columnrange`                   | Rounded-capsule range bar (vertical; horizontal via `chart.inverted`); groupable.              |
| `tick`                          | Column-width line at each value; groupable, not zero-anchored (reads like a dot plot).          |
| `butterfly`                     | Two series mirrored back-to-back around a central axis.                                        |
| `radialbar`                     | Bars around a polar centre with configurable start/end angles and optional stacking.           |
| `heatmap`                       | Category × category grid coloured by `value`; draws its own row/column labels.                 |
| `bullet`                        | Measure bar per row against qualitative `ranges` bands and a `target` marker.                  |
| `candlestick`                   | OHLC candles (`open`/`high`/`low`/`close`); up/down coloured.                                  |
| `gauge`                         | 180° dial per value; horizontal, or vertical via `chart.inverted`; supports reference markers. |
| `waterfall`                     | Running cumulative bars; `isSum` for total bars, coloured rises/falls.                         |
| `histogram`                     | Bins an array of raw numbers (`bins` to override the bin count).                               |
| `timeline`                      | Events placed in order along a line, labels alternating above/below.                           |
| `funnel`                        | Narrowing stages sized by value.                                                               |
| `treegraph`                     | Hierarchy from flat `{ id, parent, name }` points, laid out left→right.                        |
| `bubble`                        | Scatter with `z` → marker size (by area); tune with `sizeRange`.                               |
| `radar`                         | Line/area over categories on a polar grid; multiple series overlaid.                           |
| `sunburst`                      | Multi-level radial hierarchy from `{ id, parent, name, value }`.                               |
| `sankey`                        | Weighted flows from `{ from, to, weight }` links.                                              |
| `calendar`                      | Day-grid heatmap from `{ date, value }`.                                                       |
| `gantt`                         | Duration bar per row from `{ name, start, end }` (ms timestamps).                              |
| `marimekko`                     | Variable-width 100% stacked columns (width = category total).                                  |
| `errorbar`                      | Low/high whiskers per category, usually overlaid on column/line.                               |

**Data fields for the new types** — set on each point: heatmap `{ x, y, value }`;
candlestick `{ x, open, high, low, close }`; bullet `{ name, y, target, ranges }`;
gauge series `{ min, max, color, markers }` + one or more points
`{ name, y, color }`; waterfall `{ x, y }` or
`{ x, isSum: true }`; histogram raw `number[]`; treegraph / sunburst
`{ id, parent, name, value }`; bubble `{ x, y, z }`; sankey `{ from, to, weight }`;
calendar `{ date, value }`; gantt `{ name, start, end }`; variable-radius pie adds
`z` per slice.

Gauge markers can be supplied as defaults through `plotOptions.gauge` and
replaced for an individual gauge series. Marker labels support a CSS
`fontSize`, e.g. `'12px'`:

```ts
plotOptions: {
  gauge: {
    markers: [{ value: 80, label: 'Default target', fontSize: '12px' }],
  },
},
series: [
  { type: 'gauge', data: [72] }, // uses the default marker
  {
    type: 'gauge',
    markers: [{ value: 90, label: 'Stretch target' }],
    data: [84],
  },
]
```

**Stacking & grouping**: any bar/column/area series stacks with `stacking` and a
shared `stack` id; series without stacking are grouped side-by-side
automatically. Radial-bar series also support `stacking: 'normal' | 'percent'`:
matching categories share a concentric ring and each series arc begins where
the prior series ends. Set `startAngle: -90, endAngle: 90` for a half-circle
track. Angles are degrees and may define a sweep up to 360°. Mix `type`s across
series for combination charts.

**Overlapping bars**: set `grouping: false` on a column/bar/tick series to pull
it out of the side-by-side layout — it draws across the full category band
instead of its own slot, so it overlaps other `grouping: false` series in the
same category rather than sitting next to them. Combine with `columnWidth` (or
`size`) per series so a narrower bar stays visible in front of a wider one;
later entries in `series` paint on top since SVG draws in document order:

```ts
series: [
  { type: 'column', name: 'Target', data: [80, 95, 70], grouping: false, columnWidth: 30, color: '#ccc' },
  { type: 'column', name: 'Actual', data: [65, 90, 55], grouping: false, columnWidth: 14 },
]
```

**Tick**: like column/bar but draws only a line at each value — the same
width the bar would have been, with no fill down to a baseline. Because
there's no fill to visually truncate, its axis is not forced to start at
zero, so it reads like a dot plot rather than a bar chart:

```ts
series: [{ type: 'tick', name: 'Current', data: [42, 38, 51, 29] }]
```

**Rounded bar corners**: `borderRadius` rounds a column/bar's outer end — the
two corners away from the zero baseline (the top for an upward column, the
bottom for a downward one; the far end for a `bar`). The near end stays
square and flush against the baseline/axis. Radius is clamped to at most half
the bar's shorter side, so a large enough value gives a full capsule/pill
shape. Set it per series or override per point:

```ts
series: [{ type: 'column', borderRadius: 6, data: [5, 3, { y: -4, borderRadius: 0 }] }]
```

---

## Instance methods

| Method                                                    | Description                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chart.on(event, listener)`                               | Subscribe to an event (`point:click`, `render`, `drilldown`, …); returns an unsubscribe function.                                                                                                                                                                                                                      |
| `chart.update(options)`                                   | Merge new options and re-render (`series` triggers a rebuild).                                                                                                                                                                                                                                                         |
| `chart.setData(i, data)`                                  | Replace one series' data in place and re-render.                                                                                                                                                                                                                                                                       |
| `chart.addPoint(i, point)`                                | Append a point to a series and re-render.                                                                                                                                                                                                                                                                              |
| `chart.appendData(i, points, { maxPoints? })`             | Append several source points and optionally retain only the newest `maxPoints`.                                                                                                                                                                                                                                        |
| `chart.batchUpdate(callback)`                             | Run synchronous updates transactionally with one final validation, rebuild, and render. Supports nesting and rolls back a failed batch level.                                                                                                                                                                          |
| `chart.drillUp()`                                         | Return to the previous level after a drill-down.                                                                                                                                                                                                                                                                       |
| `chart.getSVG()`                                          | Serialise to a standalone SVG string.                                                                                                                                                                                                                                                                                  |
| `chart.downloadSVG(name?)` / `downloadPNG(name?, scale?)` | Download the chart as SVG / PNG.                                                                                                                                                                                                                                                                                       |
| `chart.toPNGBlob(scale?)`                                 | Rasterise to a PNG `Blob` (async).                                                                                                                                                                                                                                                                                     |
| `chart.setSize(width, height)`                            | Resize and re-render with an explicit size.                                                                                                                                                                                                                                                                            |
| `chart.reflow()`                                          | Re-read the container's current width/height and re-render if either changed — no arguments needed. Call this after your own layout (a resizable panel, a grid library, a tab becoming visible) settles, instead of waiting for a resize event. Dimensions pinned via `chart.width`/`chart.height` are left untouched. |
| `chart.destroy()`                                         | Remove the chart, disconnect the resize observer, and clear listeners.                                                                                                                                                                                                                                                 |
| `chart.legendItems`                                       | The resolved legend entries this chart will actually draw (`{ label, color, visible }[]`). Single-series point-legend charts expose one entry per point; multi-series stacked radial bars expose one per series. Read this (or `hasLegend`) instead of inferring legend visibility from `options.series.length`.             |
| `chart.hasLegend`                                         | Whether a legend will actually render — `legend.enabled !== false` **and** more than one legend entry.                                                                                                                                                                                                                 |

### Interactivity options (`chart`)

| Key         | Type                                          | Default | Description                                                                                                                                                                                                   |
| ----------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `animation` | `boolean \| { duration?, easing?, enabled? }` | on      | Enter animation: bars grow, lines draw in, others fade.                                                                                                                                                       |
| `zoom`      | `'x' \| 'y' \| 'xy' \| false \| { type }`     | off     | Drag-select on a numeric/datetime axis to zoom — `'x'`, `'y'`, or both with `'xy'`; a **Reset zoom** control restores the full range.                                                                         |
| `reflow`    | `boolean`                                     | `true`  | Auto re-render when the container's width **or** height resizes. Set `false` to disable and call `chart.reflow()` yourself.                                                                                   |
| `boost`     | `boolean \| { enabled?, threshold? }`         | auto    | Draw high-volume point/line series to a canvas overlay (lines min/max-decimated). Auto-enables past `threshold` points (default 1500). Handles 100k+ points; exports embed the canvas pixels as an SVG image. |

Axes add `type: 'datetime'` (nice date ticks) and `crosshair: true` (hover guide
line). Points add `drilldown: '<id>'`; top-level `drilldown.series` lists the
child series.

### Accessibility

| Key                         | Type                  | Default                          | Description                                                                                                                                        |
| --------------------------- | --------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                   | `boolean`             | `true`                           | Expose chart and point semantics.                                                                                                                  |
| `description`               | `string`              | chart title or generated summary | Accessible chart-level label.                                                                                                                      |
| `keyboardNavigation`        | `boolean`             | `true`                           | One Tab stop enters the chart; Arrow keys navigate points, Home/End jump, and Enter/Space activate.                                                |
| `pointDescriptionFormatter` | `(context) => string` | generated label                  | Override each point's screen-reader description. Context contains `seriesName`, `seriesIndex`, `pointIndex`, `x`, `y`, `low`, `high`, and `point`. |

SVG data marks use roving `tabindex`, so a chart with many points does not add
one page-level Tab stop per mark. Focus also shows the point tooltip. Canvas
boost mode retains the chart-level description but intentionally does not expose
thousands of individual focus targets.

### Configuration validation

`validateChartOptions(value)` accepts `unknown` and returns structured,
side-effect-free diagnostics:

```ts
const { valid, errors, warnings, issues } = validateChartOptions(candidate);
// issue: { code, severity, path, message, suggestion? }
```

It validates the root structure, registered chart/series types, positive chart
dimensions, palettes, axis bounds and indices, logarithmic values, histogram
bins, specialised point shapes and ordering, Gantt durations, Sankey weights
and cycles, hierarchy links, gauges, and drilldown references. Runtime custom
series are accepted after `registerSeriesType()`.

Automatic validation is opt-in through the root `validation` option:

| Value                         | Behavior                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `true`                        | Validate and log every issue with its code and path.                                     |
| `{ mode: 'warn' }`            | Same as `true`.                                                                          |
| `{ mode: 'error' }`           | Throw `ChartValidationError` when errors exist, before constructor/update state mutates. |
| `{ mode: 'silent', onIssue }` | Deliver structured issues without console output.                                        |

Configured validation also runs before `setData`, `addPoint`, `appendData`, and
`setSize`. A batch validates its final outer configuration atomically. Warnings
do not make `valid` false and do not throw in error mode.

Chart size defaults to the container's `clientWidth`/`clientHeight` (falling
back to 640×400 only when the container itself can't report a size, e.g.
detached from the DOM) and self-corrects on the next frame after construction
if the container hadn't finished layout yet.

---

## Package exports

```ts
// Full bundle: all built-in renderers are registered.
import {
  FacetViz,
  Chart, // main class (Chart is an alias)
  registerSeriesType,
  isSeriesTypeRegistered,
  createSeries, // custom series extensibility
  validateChartOptions,
  ChartValidationError,
  BaseSeries, // base class for custom series
  LinearScale,
  LogScale,
  CategoryScale, // scales
  Renderer, // SVG helper
  computeBoxStats, // boxplot summary helper
  DEFAULT_COLORS, // default palette
} from "facetviz";

// Modular bundle: register only selected renderer families before use.
import { FacetViz, validateChartOptions } from "facetviz/core";
import "facetviz/series/line"; // line, spline, step
import "facetviz/series/pie"; // pie, donut
```

The `facetviz/series/*` subpaths correspond to renderer modules rather than
every alias. For example `column` registers `column`, `bar`, and `butterfly`;
`range` registers `arearange` and `areasplinerange`; `scatter` registers
`scatter` and `jitter`. `facetviz/series/all` registers everything. Each family
also exports its concrete renderer class and a `register…Series()` function.
The full entrypoint remains backward compatible.

All option interfaces are exported as types for TypeScript users
(`ChartOptions`, `ChartTextOptions`, `SeriesOptions`, `AxisOptions`,
`DataLabelOptions`, …).
