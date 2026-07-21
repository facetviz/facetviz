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
- [series](#seriesoptions) · [marker](#markeroptions) · [dataLabels](#datalabeloptions) · [states.hover](#hoverstateoptions) · [boxColors](#boxplot-options) · [dumbbell](#dumbbell-options)
- [tooltip](#tooltipoptions) · [legend](#legendoptions) · [plotOptions](#plotoptions)
- [trellis](#trellisoptions) · [nested x-axis](#nested-hierarchical-x-axis)
- [Events](#events) · [Data formats](#point-data-formats) · [Chart types](#chart-types)
- [Instance methods](#instance-methods) · [Exports](#package-exports)

---

## ChartOptions

The root object passed to `new FacetViz(container, options)`.

| Key            | Type                                             | Default       | Description                                                  |
| -------------- | ------------------------------------------------ | ------------- | ------------------------------------------------------------ |
| `chart`        | [`ChartConfig`](#chartoptions-chart)             | `{}`          | Chart-wide settings (type, size, background, events).        |
| `title`        | [`TitleOptions`](#title--subtitle)               | –             | Main heading. Omit `text` to hide.                           |
| `subtitle`     | [`TitleOptions`](#title--subtitle)               | –             | Secondary heading under the title.                           |
| `xAxis`        | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}`          | X-axis config (array for multiple axes / combo charts).      |
| `yAxis`        | [`AxisOptions`](#axisoptions) \| `AxisOptions[]` | `{}`          | Y-axis config (array for multiple axes).                     |
| `tooltip`      | [`TooltipOptions`](#tooltipoptions)              | enabled       | Hover tooltip config.                                        |
| `legend`       | [`LegendOptions`](#legendoptions)                | enabled       | Legend config and placement.                                 |
| `plotOptions`  | [`PlotOptions`](#plotoptions)                    | –             | Defaults applied to all series or per type.                  |
| `series`       | [`SeriesOptions[]`](#seriesoptions)              | **required**  | One entry per data series.                                   |
| `colors`       | `string[]`                                       | theme palette | Colours cycled through by series lacking an explicit colour. |
| `theme`        | `string \| ThemeInput`                           | `'light'`     | Visual theme — see [Theming](#theming).                      |
| `trellis`      | [`TrellisOptions`](#trellisoptions)              | –             | Small-multiples / cross-tab table split.                     |
| `seriesEvents` | [`SeriesEvents`](#events)                        | –             | Event callbacks applied to every series.                     |

---

### ChartOptions.chart

| Key               | Type                               | Default         | Description                                                             |
| ----------------- | ---------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `type`            | [`ChartType`](#chart-types)        | `'line'`        | Default series type when a series omits its own `type`.                 |
| `width`           | `number`                           | container width | Chart width in px. Falls back to the container's width, then `640`.     |
| `height`          | `number`                           | `400`           | Chart height in px.                                                     |
| `backgroundColor` | `string`                           | `'#fff'`        | Plot background fill.                                                   |
| `spacing`         | `[number, number, number, number]` | `[16,16,16,16]` | Outer padding `[top, right, bottom, left]`.                             |
| `inverted`        | `boolean`                          | `false`         | Swap axes: makes column→bar, and renders boxplot/dumbbell horizontally. |
| `polar`           | `boolean`                          | `false`         | Reserved for polar rendering.                                           |
| `colors`          | `string[]`                         | –               | Alias of top-level `colors`.                                            |
| `events`          | [`ChartEvents`](#events)           | –               | Chart-level `load` / `render` / `click` callbacks.                      |

> The chart is **responsive**: the SVG scales down (`max-width: 100%`) to never
> overflow its parent, even when an explicit `width` is larger than the container.

---

### Title & subtitle

`TitleOptions` (used by both `title` and `subtitle`):

| Key     | Type                            | Default    | Description                                             |
| ------- | ------------------------------- | ---------- | ------------------------------------------------------- |
| `text`  | `string`                        | –          | The text. **Omit to hide** the title/subtitle entirely. |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | Horizontal alignment.                                   |
| `style` | `Record<string, string>`        | –          | Extra SVG text attributes (e.g. `{ fill: '#333' }`).    |

---

## AxisOptions

Applies to both `xAxis` and `yAxis`. A **category axis** is used when
`categories` is present (or `type: 'category'`); otherwise a **value axis**
(`linear` or `log`).

| Key             | Type                                               | Default     | Description                                                                                                                                        |
| --------------- | -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visible`       | `boolean`                                          | `true`      | When `false`, nothing is drawn and **no space is reserved** for the axis.                                                                          |
| `opposite`      | `boolean`                                          | `false`     | Move the axis to the opposite side: **y → right**, **x → top**. For a nested x-axis this triggers the [split layout](#nested-hierarchical-x-axis). |
| `categories`    | `string[]`                                         | –           | Category labels; makes this a categorical axis.                                                                                                    |
| `type`          | `'linear' \| 'log' \| 'category'`                  | inferred    | Scale type.                                                                                                                                        |
| `title`         | `{ text?: string; style?: Record<string,string> }` | –           | Axis title. Omit `text` to hide.                                                                                                                   |
| `min`           | `number`                                           | data min    | Force the axis minimum (value axes).                                                                                                               |
| `max`           | `number`                                           | data max    | Force the axis maximum (value axes).                                                                                                               |
| `tickCount`     | `number`                                           | auto        | Approximate number of ticks (linear axes).                                                                                                         |
| `labels`        | [`AxisLabelOptions`](#axis-labels)                 | enabled     | Tick label config.                                                                                                                                 |
| `gridLineWidth` | `number`                                           | `1`         | Grid line thickness (value axis). `0` hides grid lines.                                                                                            |
| `gridLineColor` | `string`                                           | `'#e6e6e6'` | Grid line colour.                                                                                                                                  |
| `lineColor`     | `string`                                           | `'#ccd6eb'` | Axis line colour.                                                                                                                                  |
| `lineWidth`     | `number`                                           | `1`         | Axis line thickness. `0` hides the axis line.                                                                                                      |
| `plotLines`     | [`PlotLineOptions[]`](#plotlineoptions)            | –           | Reference lines at fixed values.                                                                                                                   |
| `plotBands`     | [`PlotBandOptions[]`](#plotbandoptions)            | –           | Shaded value bands.                                                                                                                                |
| `reversed`      | `boolean`                                          | `false`     | Reverse the axis direction.                                                                                                                        |
| `startOnZero`   | `boolean`                                          | –           | Force a value axis to include zero.                                                                                                                |
| `dimension`     | `string`                                           | –           | Bind this axis to a data field for [trellis](#trellisoptions) splitting.                                                                           |
| `dimensions`    | `string[]`                                         | –           | Two or more fields → [nested hierarchical x-axis](#nested-hierarchical-x-axis).                                                                    |
| `aggregate`     | `'sum' \| 'avg' \| 'count' \| 'min' \| 'max'`      | `'sum'`     | Aggregation used to collapse points into nested-axis leaves.                                                                                       |

### Axis labels

`AxisOptions.labels`:

| Key         | Type                    | Default     | Description                                                                                                                                                         |
| ----------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | `boolean`               | `true`      | Show tick labels. Set `false` to hide labels but keep the axis line.                                                                                                |
| `format`    | `string`                | `'{value}'` | Token string; `{value}` is the tick value. Accepts format specs / dates — see [Text & label formatting](#text--label-formatting).                                   |
| `formatter` | `(value) => string`     | –           | Custom label function (overrides `format`).                                                                                                                         |
| `rotation`  | `number`                | `0`         | Rotate tick labels by this angle (degrees), e.g. `-45` or `-90` for long/crowded categories. Labels are anchored to their tick and the axis band grows to fit them. |
| `style`     | `Record<string,string>` | –           | Extra text attributes.                                                                                                                                              |

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
| `xAxis`          | `number`                                                  | `0`           | Index of the bound x-axis.                                                                                                                                                                                                                      |
| `yAxis`          | `number`                                                  | `0`           | Index of the bound y-axis. `1` = secondary axis, drawn on the right with its own scale — pass `yAxis` (top-level) as a 2-element array to configure it. Works with a plain categorical x-axis or a [nested one](#nested-hierarchical-x-axis).   |
| `lineWidth`      | `number`                                                  | `2`           | Stroke width (line/area/range).                                                                                                                                                                                                                 |
| `innerSize`      | `string`                                                  | –             | Pie inner radius, e.g. `'60%'` (makes a donut).                                                                                                                                                                                                 |
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

| Key              | Type     | Default       | Description                                                |
| ---------------- | -------- | ------------- | ------------------------------------------------------------ |
| `lowColor`       | `string` | series colour | Low-end marker colour.                                       |
| `highColor`      | `string` | series colour | High-end marker colour (also the legend swatch).              |
| `connectorColor` | `string` | `'#b0b0b0'`   | Connector line colour.                                        |
| `connectorWidth` | `number` | `3`           | Connector line thickness.                                     |

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

On-chart value labels; supported on column/bar, line/area/spline/step,
scatter/jitter, pie/donut and butterfly.

| Key               | Type                            | Default        | Description                                                                                                                                                                                 |
| ----------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | `boolean`                       | `false`        | Show labels.                                                                                                                                                                                |
| `format`          | `string`                        | `'{y}'`        | Token string with tokens/specs — `{x}`, `{y}`, `{name}`, `{series}`, `{percentage}`, `{total}`, `{point.<field>}`, e.g. `{y:,.1f}`. See [Text & label formatting](#text--label-formatting). |
| `formatter`       | `(ctx: LabelContext) => string` | –              | Custom label function (overrides `format`).                                                                                                                                                 |
| `color`           | `string`                        | theme          | Text colour.                                                                                                                                                                                |
| `fontSize`        | `string`                        | `'11px'`       | Font size.                                                                                                                                                                                  |
| `fontWeight`      | `string`                        | –              | e.g. `'600'`.                                                                                                                                                                               |
| `position`        | see below                       | type-dependent | Where the label sits.                                                                                                                                                                       |
| `distance`        | `number`                        | `0`            | Extra offset in the label's natural direction.                                                                                                                                              |
| `rotation`        | `number`                        | `0`            | Rotate the text.                                                                                                                                                                            |
| `backgroundColor` | `string`                        | –              | Draw a background chip behind the label.                                                                                                                                                    |

**`position` values by series family:**

| Family                | Values (default first)                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| column / bar          | `outside`, `inside`, `center`, `base` — defaults to `center` for a stacked point instead, since `outside` (just past that point's own segment) sits inside whichever segment is stacked above it |
| line / area / scatter | `top`, `bottom`, `center`, `left`, `right`                                                                                                                                                       |
| pie / donut           | `outside`, `inside`                                                                                                                                                                              |

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

| Key             | Type                            | Default        | Description                                                            |
| --------------- | ------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `enabled`       | `boolean`                       | `true`         | Show the legend.                                                       |
| `layout`        | `'horizontal' \| 'vertical'`    | `'horizontal'` | `horizontal` → strip at top/bottom; `vertical` → column at left/right. |
| `verticalAlign` | `'top' \| 'bottom'`             | `'bottom'`     | Placement for a horizontal legend.                                     |
| `align`         | `'left' \| 'center' \| 'right'` | `'center'`     | Horizontal alignment, or the side for a vertical legend.               |
| `itemStyle`     | `Record<string,string>`         | –              | Extra item text attributes.                                            |

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

| Key                            | Type               | Used by                              |
| ------------------------------ | ------------------ | ------------------------------------ |
| `x`                            | `number \| string` | all                                  |
| `y`                            | `number`           | most                                 |
| `low` / `high`                 | `number`           | range, dumbbell                      |
| `min`/`q1`/`median`/`q3`/`max` | `number`           | boxplot                              |
| `outliers`                     | `number[]`         | boxplot (values beyond the whiskers) |
| `boxColors` / `outlierMarker`  | see [Boxplot options](#boxplot-options) | boxplot — per-point override |
| `lowColor`/`highColor`/`connectorColor`/`connectorWidth` | see [Dumbbell options](#dumbbell-options) | dumbbell — per-point override |
| `name`                         | `string`           | pie / categorical                    |
| `color`                        | `string`           | per-point colour (any series)        |
| _(custom)_                     | `any`              | surfaced in tooltips & events        |

Use `computeBoxStats(values)` (exported) to derive the five-number summary from a
raw array for boxplots.

---

## Chart types

| Type                            | Description                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `bar`                           | Horizontal bars.                                                                  |
| `column`                        | Vertical bars.                                                                    |
| `line` / `spline` / `step`      | Line variants (straight / smoothed / stepped).                                    |
| `area` / `areaspline`           | Filled line / smoothed filled line.                                               |
| `arearange` / `areasplinerange` | Filled band between `low` and `high`.                                             |
| `pie` / `donut`                 | Circular proportion (donut = `innerSize`).                                        |
| `scatter` / `jitter`            | Point clouds (jitter adds horizontal spread).                                     |
| `boxplot`                       | Five-number distribution; dual-colour, horizontal & groupable.                    |
| `dumbbell`                      | Two connected points per category; horizontal & groupable.                        |
| `columnrange`                   | Rounded-capsule range bar (vertical; horizontal via `chart.inverted`); groupable. |
| `butterfly`                     | Two series mirrored back-to-back around a central axis.                           |
| `radialbar`                     | Bars around a polar centre (0→270°).                                              |
| `heatmap`                       | Category × category grid coloured by `value`; draws its own row/column labels.    |
| `bullet`                        | Measure bar per row against qualitative `ranges` bands and a `target` marker.     |
| `candlestick`                   | OHLC candles (`open`/`high`/`low`/`close`); up/down coloured.                     |
| `gauge`                         | 270° radial dial for one value; `min`/`max` and coloured `bands`.                 |
| `waterfall`                     | Running cumulative bars; `isSum` for total bars, coloured rises/falls.            |
| `histogram`                     | Bins an array of raw numbers (`bins` to override the bin count).                  |
| `timeline`                      | Events placed in order along a line, labels alternating above/below.              |
| `funnel`                        | Narrowing stages sized by value.                                                  |
| `treegraph`                     | Hierarchy from flat `{ id, parent, name }` points, laid out left→right.           |
| `bubble`                        | Scatter with `z` → marker size (by area); tune with `sizeRange`.                  |
| `radar`                         | Line/area over categories on a polar grid; multiple series overlaid.              |
| `sunburst`                      | Multi-level radial hierarchy from `{ id, parent, name, value }`.                  |
| `sankey`                        | Weighted flows from `{ from, to, weight }` links.                                 |
| `calendar`                      | Day-grid heatmap from `{ date, value }`.                                          |
| `gantt`                         | Duration bar per row from `{ name, start, end }` (ms timestamps).                 |
| `marimekko`                     | Variable-width 100% stacked columns (width = category total).                     |
| `errorbar`                      | Low/high whiskers per category, usually overlaid on column/line.                  |

**Data fields for the new types** — set on each point: heatmap `{ x, y, value }`;
candlestick `{ x, open, high, low, close }`; bullet `{ name, y, target, ranges }`;
gauge series `{ min, max, bands }` + one point `{ y }`; waterfall `{ x, y }` or
`{ x, isSum: true }`; histogram raw `number[]`; treegraph / sunburst
`{ id, parent, name, value }`; bubble `{ x, y, z }`; sankey `{ from, to, weight }`;
calendar `{ date, value }`; gantt `{ name, start, end }`; variable-radius pie adds
`z` per slice.

**Stacking & grouping**: any bar/column/area series stacks with `stacking` and a
shared `stack` id; series without stacking are grouped side-by-side
automatically. Mix `type`s across series for combination charts.

---

## Instance methods

| Method                                                    | Description                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chart.on(event, listener)`                               | Subscribe to an event (`point:click`, `render`, `drilldown`, …); returns an unsubscribe function.                                                                                                                                                                                                                      |
| `chart.update(options)`                                   | Merge new options and re-render (`series` triggers a rebuild).                                                                                                                                                                                                                                                         |
| `chart.setData(i, data)`                                  | Replace one series' data in place and re-render.                                                                                                                                                                                                                                                                       |
| `chart.addPoint(i, point)`                                | Append a point to a series and re-render.                                                                                                                                                                                                                                                                              |
| `chart.drillUp()`                                         | Return to the previous level after a drill-down.                                                                                                                                                                                                                                                                       |
| `chart.getSVG()`                                          | Serialise to a standalone SVG string.                                                                                                                                                                                                                                                                                  |
| `chart.downloadSVG(name?)` / `downloadPNG(name?, scale?)` | Download the chart as SVG / PNG.                                                                                                                                                                                                                                                                                       |
| `chart.toPNGBlob(scale?)`                                 | Rasterise to a PNG `Blob` (async).                                                                                                                                                                                                                                                                                     |
| `chart.setSize(width, height)`                            | Resize and re-render with an explicit size.                                                                                                                                                                                                                                                                            |
| `chart.reflow()`                                          | Re-read the container's current width/height and re-render if either changed — no arguments needed. Call this after your own layout (a resizable panel, a grid library, a tab becoming visible) settles, instead of waiting for a resize event. Dimensions pinned via `chart.width`/`chart.height` are left untouched. |
| `chart.destroy()`                                         | Remove the chart, disconnect the resize observer, and clear listeners.                                                                                                                                                                                                                                                 |
| `chart.legendItems`                                       | The resolved legend entries this chart will actually draw (`{ label, color, visible }[]`). Point-legend types (pie/donut/radialbar) are always exactly **one** series internally — don't infer legend visibility from `options.series.length`; read this (or `hasLegend`) instead.                                     |
| `chart.hasLegend`                                         | Whether a legend will actually render — `legend.enabled !== false` **and** more than one legend entry.                                                                                                                                                                                                                 |

### Interactivity options (`chart`)

| Key         | Type                                          | Default | Description                                                                                                                                                                                                            |
| ----------- | --------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `animation` | `boolean \| { duration?, easing?, enabled? }` | on      | Enter animation: bars grow, lines draw in, others fade.                                                                                                                                                                |
| `zoom`      | `'x' \| 'y' \| 'xy' \| false \| { type }`     | off     | Drag-select on a numeric/datetime axis to zoom — `'x'`, `'y'`, or both with `'xy'`; a **Reset zoom** control restores the full range.                                                                                  |
| `reflow`    | `boolean`                                     | `true`  | Auto re-render when the container's width **or** height resizes. Set `false` to disable and call `chart.reflow()` yourself.                                                                                            |
| `boost`     | `boolean \| { enabled?, threshold? }`         | auto    | Draw high-volume point/line series to a canvas overlay (lines min/max-decimated). Auto-enables past `threshold` points (default 1500). Handles 100k+ points; exports embed the canvas pixels as an SVG image. |

Axes add `type: 'datetime'` (nice date ticks) and `crosshair: true` (hover guide
line). Points add `drilldown: '<id>'`; top-level `drilldown.series` lists the
child series. `accessibility: { description }` overrides the auto SVG label.

Chart size defaults to the container's `clientWidth`/`clientHeight` (falling
back to 640×400 only when the container itself can't report a size, e.g.
detached from the DOM) and self-corrects on the next frame after construction
if the container hadn't finished layout yet.

---

## Package exports

```ts
import {
  FacetViz,
  Chart, // main class (Chart is an alias)
  registerSeriesType,
  createSeries, // custom series extensibility
  BaseSeries, // base class for custom series
  LinearScale,
  LogScale,
  CategoryScale, // scales
  Renderer, // SVG helper
  computeBoxStats, // boxplot summary helper
  DEFAULT_COLORS, // default palette
} from "facetviz";
```

All option interfaces are exported as types for TypeScript users
(`ChartOptions`, `SeriesOptions`, `AxisOptions`, `DataLabelOptions`, …).
