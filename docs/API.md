# JChart API Reference

Complete reference for every configuration key. JChart's config object mirrors
Highcharts, so most option names will be familiar.

```ts
import { JChart } from 'jchart';

const chart = new JChart(container, options);
```

- **`container`** — a DOM element, or a CSS selector string resolving to one.
- **`options`** — a [`ChartOptions`](#chartoptions) object (only `series` is required).

**Contents**

- [ChartOptions](#chartoptions) · [chart](#chartoptions-chart) · [title / subtitle](#title--subtitle)
- [Axes](#axisoptions) · [plotLines](#plotlineoptions) · [plotBands](#plotbandoptions)
- [series](#seriesoptions) · [marker](#markeroptions) · [dataLabels](#datalabeloptions) · [states.hover](#hoverstateoptions) · [boxColors](#boxplot-options)
- [tooltip](#tooltipoptions) · [legend](#legendoptions) · [plotOptions](#plotoptions)
- [trellis](#trellisoptions) · [nested x-axis](#nested-hierarchical-x-axis)
- [Events](#events) · [Data formats](#point-data-formats) · [Chart types](#chart-types)
- [Instance methods](#instance-methods) · [Exports](#package-exports)

---

## ChartOptions

The root object passed to `new JChart(container, options)`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `chart` | [`ChartConfig`](#chartoptions-chart) | `{}` | Chart-wide settings (type, size, background, events). |
| `title` | [`TitleOptions`](#title--subtitle) | – | Main heading. Omit `text` to hide. |
| `subtitle` | [`TitleOptions`](#title--subtitle) | – | Secondary heading under the title. |
| `xAxis` | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}` | X-axis config (array for multiple axes / combo charts). |
| `yAxis` | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}` | Y-axis config (array for multiple axes). |
| `tooltip` | [`TooltipOptions`](#tooltipoptions) | enabled | Hover tooltip config. |
| `legend` | [`LegendOptions`](#legendoptions) | enabled | Legend config and placement. |
| `plotOptions` | [`PlotOptions`](#plotoptions) | – | Defaults applied to all series or per type. |
| `series` | [`SeriesOptions[]`](#seriesoptions) | **required** | One entry per data series. |
| `colors` | `string[]` | theme palette | Colours cycled through by series lacking an explicit colour. |
| `theme` | `string \| ThemeInput` | `'light'` | Visual theme — see [Theming](#theming). |
| `trellis` | [`TrellisOptions`](#trellisoptions) | – | Small-multiples / Tableau table split. |
| `seriesEvents` | [`SeriesEvents`](#events) | – | Event callbacks applied to every series. |

---

### ChartOptions.chart

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `type` | [`ChartType`](#chart-types) | `'line'` | Default series type when a series omits its own `type`. |
| `width` | `number` | container width | Chart width in px. Falls back to the container's width, then `640`. |
| `height` | `number` | `400` | Chart height in px. |
| `backgroundColor` | `string` | `'#fff'` | Plot background fill. |
| `spacing` | `[number, number, number, number]` | `[16,16,16,16]` | Outer padding `[top, right, bottom, left]`. |
| `inverted` | `boolean` | `false` | Swap axes: makes column→bar, and renders boxplot/dumbbell horizontally. |
| `polar` | `boolean` | `false` | Reserved for polar rendering. |
| `colors` | `string[]` | – | Alias of top-level `colors`. |
| `events` | [`ChartEvents`](#events) | – | Chart-level `load` / `render` / `click` callbacks. |

> The chart is **responsive**: the SVG scales down (`max-width: 100%`) to never
> overflow its parent, even when an explicit `width` is larger than the container.

---

### Title & subtitle

`TitleOptions` (used by both `title` and `subtitle`):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `text` | `string` | – | The text. **Omit to hide** the title/subtitle entirely. |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | Horizontal alignment. |
| `style` | `Record<string, string>` | – | Extra SVG text attributes (e.g. `{ fill: '#333' }`). |

---

## AxisOptions

Applies to both `xAxis` and `yAxis`. A **category axis** is used when
`categories` is present (or `type: 'category'`); otherwise a **value axis**
(`linear` or `log`).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `visible` | `boolean` | `true` | When `false`, nothing is drawn and **no space is reserved** for the axis. |
| `opposite` | `boolean` | `false` | Move the axis to the opposite side: **y → right**, **x → top**. For a nested x-axis this triggers the [split layout](#nested-hierarchical-x-axis). |
| `categories` | `string[]` | – | Category labels; makes this a categorical axis. |
| `type` | `'linear' \| 'log' \| 'category'` | inferred | Scale type. |
| `title` | `{ text?: string; style?: Record<string,string> }` | – | Axis title. Omit `text` to hide. |
| `min` | `number` | data min | Force the axis minimum (value axes). |
| `max` | `number` | data max | Force the axis maximum (value axes). |
| `tickCount` | `number` | auto | Approximate number of ticks (linear axes). |
| `labels` | [`AxisLabelOptions`](#axis-labels) | enabled | Tick label config. |
| `gridLineWidth` | `number` | `1` | Grid line thickness (value axis). `0` hides grid lines. |
| `gridLineColor` | `string` | `'#e6e6e6'` | Grid line colour. |
| `lineColor` | `string` | `'#ccd6eb'` | Axis line colour. |
| `lineWidth` | `number` | `1` | Axis line thickness. `0` hides the axis line. |
| `plotLines` | [`PlotLineOptions[]`](#plotlineoptions) | – | Reference lines at fixed values. |
| `plotBands` | [`PlotBandOptions[]`](#plotbandoptions) | – | Shaded value bands. |
| `reversed` | `boolean` | `false` | Reverse the axis direction. |
| `startOnZero` | `boolean` | – | Force a value axis to include zero. |
| `dimension` | `string` | – | Bind this axis to a data field for [trellis](#trellisoptions) splitting. |
| `dimensions` | `string[]` | – | Two or more fields → [nested hierarchical x-axis](#nested-hierarchical-x-axis). |
| `aggregate` | `'sum' \| 'avg' \| 'count' \| 'min' \| 'max'` | `'sum'` | Aggregation used to collapse points into nested-axis leaves. |

### Axis labels

`AxisOptions.labels`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Show tick labels. Set `false` to hide labels but keep the axis line. |
| `format` | `string` | `'{value}'` | Token string; `{value}` is the tick value. |
| `formatter` | `(value) => string` | – | Custom label function (overrides `format`). |
| `rotation` | `number` | `0` | Label rotation in degrees. |
| `style` | `Record<string,string>` | – | Extra text attributes. |

### PlotLineOptions

A reference line drawn across the plot (x-axis → vertical, y-axis → horizontal).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `value` | `number \| string` | **required** | Axis value the line crosses. |
| `color` | `string` | `'#e63946'` | Line colour. |
| `width` | `number` | `1.5` | Line thickness. |
| `dashStyle` | `string` | – | SVG dash array, e.g. `'4 3'`. |
| `label` | `{ text; align?; color? }` | – | Optional inline label. |

### PlotBandOptions

A shaded band spanning an axis interval.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `from` | `number \| string` | **required** | Band start value. |
| `to` | `number \| string` | **required** | Band end value. |
| `color` | `string` | `rgba(70,130,180,0.12)` | Fill colour. |
| `label` | `{ text; align?; color? }` | – | Optional label. |

```ts
yAxis: {
  plotBands: [{ from: 5, to: 7, color: 'rgba(0,200,120,0.1)', label: { text: 'target' } }],
  plotLines: [{ value: 6, color: '#e63946', dashStyle: '5 4', label: { text: 'goal' } }],
}
```

---

## SeriesOptions

One object per series in the `series` array.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `data` | [`PointInput[]`](#point-data-formats) | **required** | The data points. |
| `type` | [`ChartType`](#chart-types) | `chart.type` | Series type; enables combination charts. |
| `name` | `string` | – | Series name (legend, tooltip). |
| `color` | `string` | palette | Series colour. |
| `visible` | `boolean` | `true` | Initial visibility (toggled via the legend). |
| `stack` | `string \| number` | – | Series sharing a stack id pile together. |
| `stacking` | `'normal' \| 'percent'` | – | Enable stacking (`percent` = 100% stacked). |
| `xAxis` | `number` | `0` | Index of the bound x-axis. |
| `yAxis` | `number` | `0` | Index of the bound y-axis (combo charts). |
| `lineWidth` | `number` | `2` | Stroke width (line/area/range). |
| `innerSize` | `string` | – | Pie inner radius, e.g. `'60%'` (makes a donut). |
| `dimensions` | `string[]` | – | Pie/donut **two-dimension** rings — see [Multi-level pie](#multi-level-two-dimension-pie). |
| `marker` | [`MarkerOptions`](#markeroptions) | – | Point markers (line/area/scatter). |
| `dataLabels` | [`DataLabelOptions`](#datalabeloptions) | disabled | On-chart value labels. |
| `jitter` | `number` | `0.5` | Horizontal spread (in band widths) for `jitter` charts. |
| `states` | `{ hover?: `[`HoverStateOptions`](#hoverstateoptions)` }` | – | Interaction states. |
| `tooltip` | [`SeriesTooltipOptions`](#tooltipoptions) | – | Per-series tooltip overrides. |
| `boxColors` | [see below](#boxplot-options) | – | Boxplot colours. |
| `lowColor` | `string` | series colour | Dumbbell low-end marker colour. |
| `highColor` | `string` | series colour | Dumbbell high-end marker colour (also the legend swatch). |
| `connectorColor` | `string` | `'#b0b0b0'` | Dumbbell connector line colour. |
| `connectorWidth` | `number` | `3` | Dumbbell connector thickness. |

Any extra keys you add to a series or point are preserved and surfaced back in
tooltips and event payloads.

### Boxplot options

`SeriesOptions.boxColors` — set `lower`/`upper` to two **distinct hues** for a
split-colour box, or leave unset for two shades of the series colour.

| Key | Type | Description |
|-----|------|-------------|
| `lower` | `string` | Fill for the q1→median half. |
| `upper` | `string` | Fill for the median→q3 half. |
| `median` | `string` | Median line colour. |
| `whisker` | `string` | Whisker/cap colour. |
| `border` | `string` | Box outline colour. |

Boxplots render **horizontally** when `chart.inverted` is set, and multiple
boxplot series **group** side-by-side within each category.

### MarkerOptions

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` (line/area), `true` (scatter) | Show markers. |
| `radius` | `number` | `4` | Marker radius. |
| `symbol` | `'circle' \| 'square' \| 'diamond' \| 'triangle'` | `'circle'` | Marker shape. |
| `fillColor` | `string` | series colour | Marker fill. |
| `lineColor` | `string` | `'#fff'` | Marker border. |
| `lineWidth` | `number` | `1` | Marker border width. |

### DataLabelOptions

On-chart value labels; supported on column/bar, line/area/spline/step,
scatter/jitter, pie/donut and butterfly.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` | Show labels. |
| `format` | `string` | `'{y}'` | Token string. Tokens: `{x}`, `{y}`, `{point.<field>}`; pie also has `{name}`, `{percentage}`. |
| `formatter` | `(ctx: LabelContext) => string` | – | Custom label function (overrides `format`). |
| `color` | `string` | theme | Text colour. |
| `fontSize` | `string` | `'11px'` | Font size. |
| `fontWeight` | `string` | – | e.g. `'600'`. |
| `position` | see below | type-dependent | Where the label sits. |
| `distance` | `number` | `0` | Extra offset in the label's natural direction. |
| `rotation` | `number` | `0` | Rotate the text. |
| `backgroundColor` | `string` | – | Draw a background chip behind the label. |

**`position` values by series family:**

| Family | Values (default first) |
|--------|------------------------|
| column / bar | `outside`, `inside`, `center`, `base` |
| line / area / scatter | `top`, `bottom`, `center`, `left`, `right` |
| pie / donut | `outside`, `inside` |

`LabelContext` (passed to `formatter`): `{ x, y, point, series }`.

### Multi-level (two-dimension) pie

Give a pie/donut series two field names in `dimensions` to render concentric
rings: the **inner** ring groups by the first field (labelled inside), the
**outer** ring breaks each group down by the second field (shaded variants of the
parent colour, with leader-line labels). The legend lists the inner groups and
toggling one hides its whole wedge.

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

Outside pie/donut labels are always joined to their slice with a **leader line**
so the label↔slice mapping is unambiguous. Use `dataLabels.position: 'inside'`
to place labels on the slice instead (no leader line).

### HoverStateOptions

`SeriesOptions.states.hover` — subtle brightness highlight by default; scaling is
opt-in.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable hover highlight. |
| `brightness` | `number` | `0.08` | Brightness increase ratio on hover. |
| `scale` | `number` | – | Optional scale multiplier, e.g. `1.1`. |

---

## TooltipOptions

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Show tooltips. Set `false` to disable globally. |
| `format` | `string` | – | Token string: `{series}`, `{x}`, `{y}`, `{low}`, `{high}`, `{point.<field>}`. |
| `formatter` | `(ctx: TooltipContext) => string` | – | Custom HTML content (overrides `format`). |
| `shared` | `boolean` | `false` | Combine all points at an x into one tooltip. |
| `backgroundColor` | `string` | – | Tooltip background. |
| `borderColor` | `string` | – | Tooltip border. |
| `valuePrefix` | `string` | – | Prepended to numeric values. |
| `valueSuffix` | `string` | – | Appended to numeric values. |
| `valueDecimals` | `number` | – | Fixed decimal places. |

`SeriesTooltipOptions` is the subset `{ format, formatter, valuePrefix,
valueSuffix, valueDecimals }`, settable per series.

`TooltipContext` (passed to `formatter`):
`{ series, x, y, low?, high?, box?, point, color, points? }` — `box` is the
five-number summary for boxplots; `points` is present when `shared` is on.

Boxplot and range series get sensible default multi-line tooltips automatically.

---

## LegendOptions

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Show the legend. |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | `horizontal` → strip at top/bottom; `vertical` → column at left/right. |
| `verticalAlign` | `'top' \| 'bottom'` | `'bottom'` | Placement for a horizontal legend. |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | Horizontal alignment, or the side for a vertical legend. |
| `itemStyle` | `Record<string,string>` | – | Extra item text attributes. |

**Placement matrix**

| Want | Config |
|------|--------|
| Bottom (default) | `{}` |
| Top | `{ verticalAlign: 'top' }` |
| Right | `{ layout: 'vertical', align: 'right' }` |
| Left | `{ layout: 'vertical', align: 'left' }` |

Clicking a legend item toggles that series (or, for pie/donut/radialbar, that
slice) — re-rendering with the value re-distributed.

---

## Theming

Set `theme` to a built-in name or a custom object. Explicit `colors`,
`chart.backgroundColor`, and per-axis colours always override the theme.

**Built-in themes:** `'light'` (default), `'dark'`, `'high-contrast'`, `'pastel'`.

```ts
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

| Token | Description |
|-------|-------------|
| `colors` | `string[]` categorical series palette. |
| `backgroundColor` | Chart background. |
| `fontFamily` | Font stack for all text. |
| `title` | `{ color, fontSize, fontWeight }`. |
| `subtitle` | `{ color, fontSize }`. |
| `axis` | `{ labelColor, titleColor, lineColor, gridLineColor }`. |
| `dataLabel` | `{ color }`. |
| `legend` | `{ color, hiddenColor }`. |
| `tooltip` | `{ backgroundColor, borderColor, color }`. |
| `neutralColor` | Muted colour for connectors / neutral marks. |

Register a reusable named theme at runtime:

```ts
import { registerTheme, LIGHT_THEME } from 'jchart';
registerTheme('corp', { ...LIGHT_THEME, colors: ['#003f5c', '#bc5090', '#ffa600'] });
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

---

## TrellisOptions

Splits one dataset into a grid of panels (small multiples) by data fields.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `columns` | `string` | – | Field whose values become grid columns. |
| `rows` | `string` | – | Field whose values become grid rows. |
| `gap` | `number` | `14`/`24` | Gap in px between panels. |
| `table` | `boolean` | `true` | `true` → Tableau-style table (shared axes, headers once); `false` → independent panels. |
| `sharedX` | `boolean` | `true` | Share the x scale across panels. |
| `sharedY` | `boolean` | `true` | Share the y scale across panels. |

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
  separate each top-level group (the classic Tableau columns-shelf look).

---

## Events

Register callbacks in config, or subscribe via [`chart.on()`](#instance-methods).

**`ChartEvents`** (`chart.events`): `load(chart)`, `render(chart)`, `click(ev)`.

**`SeriesEvents`** (`seriesEvents`, applied to all series):
`click(ev)`, `mouseOver(ev)`, `mouseOut(ev)`, `legendItemClick({ series, visible })`.

**`JChartPointEvent`** (`ev`) payload:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | `'click'` / `'mouseOver'` / `'mouseOut'`. |
| `seriesName` | `string` | Series name. |
| `seriesIndex` | `number` | Series index. |
| `pointIndex` | `number` | Point index within the series. |
| `x` | `number \| string` | Point x. |
| `y` | `number \| undefined` | Point y. |
| `point` | `PointOptions` | Full point object (incl. custom fields). |
| `domEvent` | `Event` | The originating DOM event. |

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

| Form | Example | Meaning |
|------|---------|---------|
| number | `5` | y-value; x taken from index/categories. |
| `[x, y]` | `['Jan', 5]` | Explicit x and y. |
| `[x, low, high]` | `['Jan', 3, 8]` | Range / dumbbell low & high. |
| object | `{ y: 5, color: '#f00' }` | Full [`PointOptions`](#pointoptions). |
| `null` | `null` | A gap (line/area). |

### PointOptions

| Key | Type | Used by |
|-----|------|---------|
| `x` | `number \| string` | all |
| `y` | `number` | most |
| `low` / `high` | `number` | range, dumbbell |
| `min`/`q1`/`median`/`q3`/`max` | `number` | boxplot |
| `name` | `string` | pie / categorical |
| `color` | `string` | per-point colour (any series) |
| *(custom)* | `any` | surfaced in tooltips & events |

Use `computeBoxStats(values)` (exported) to derive the five-number summary from a
raw array for boxplots.

---

## Chart types

| Type | Description |
|------|-------------|
| `bar` | Horizontal bars. |
| `column` | Vertical bars. |
| `line` / `spline` / `step` | Line variants (straight / smoothed / stepped). |
| `area` / `areaspline` | Filled line / smoothed filled line. |
| `arearange` / `areasplinerange` | Filled band between `low` and `high`. |
| `pie` / `donut` | Circular proportion (donut = `innerSize`). |
| `scatter` / `jitter` | Point clouds (jitter adds horizontal spread). |
| `boxplot` | Five-number distribution; dual-colour, horizontal & groupable. |
| `dumbbell` | Two connected points per category; horizontal & groupable. |
| `butterfly` | Two series mirrored back-to-back around a central axis. |
| `radialbar` | Bars around a polar centre (0→270°). |

**Stacking & grouping**: any bar/column/area series stacks with `stacking` and a
shared `stack` id; series without stacking are grouped side-by-side
automatically. Mix `type`s across series for combination charts.

---

## Instance methods

| Method | Description |
|--------|-------------|
| `chart.on(event, listener)` | Subscribe to an event; returns an unsubscribe function. |
| `chart.update(options)` | Merge new options and re-render (`series` triggers a rebuild). |
| `chart.setSize(width, height)` | Resize and re-render. |
| `chart.destroy()` | Remove the chart and its listeners. |

---

## Package exports

```ts
import {
  JChart, Chart,                       // main class (Chart is an alias)
  registerSeriesType, createSeries,    // custom series extensibility
  BaseSeries,                          // base class for custom series
  LinearScale, LogScale, CategoryScale,// scales
  Renderer,                            // SVG helper
  computeBoxStats,                     // boxplot summary helper
  DEFAULT_COLORS,                      // default palette
} from 'jchart';
```

All option interfaces are exported as types for TypeScript users
(`ChartOptions`, `SeriesOptions`, `AxisOptions`, `DataLabelOptions`, …).
