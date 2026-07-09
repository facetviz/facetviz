# JChart

A modular, dependency-free **TypeScript + SVG** charting library with a
**Highcharts-like API**, Tableau-style small multiples (trellising), and a wide
range of chart types. Designed to be read and maintained by hand — every chart
type, scale, and helper is a small, self-contained module.

📖 **[Full API reference → docs/API.md](docs/API.md)** — every option key and value documented.

```ts
import { JChart } from 'jchart';

new JChart('#container', {
  chart: { type: 'column' },
  title: { text: 'Fruit consumption' },
  subtitle: { text: 'in units' },
  xAxis: { categories: ['Apples', 'Pears', 'Bananas'] },
  yAxis: { title: { text: 'Units' } },
  tooltip: { format: '<b>{series}</b><br/>{x}: {y}' },
  series: [
    { name: 'Jane', data: [1, 5, 3] },
    { name: 'John', data: [4, 2, 6] },
  ],
});
```

## Getting started

```bash
npm install       # install dev deps (typescript, vite)
npm run build     # compile src → dist (ESM + .d.ts)
npm run dev       # live examples at http://localhost:5173
npm run typecheck # type-only check
```

## Chart types

| Category | Types |
| --- | --- |
| Bars | `column` (vertical), `bar` (horizontal) |
| Lines | `line`, `spline`, `step`, `area`, `areaspline` |
| Range | `arearange`, `areasplinerange` (filled band between `low`/`high`) |
| Circular | `pie`, `donut`, `radialbar` |
| Points | `scatter`, `jitter`, `dumbbell` |
| Statistical | `boxplot` (dual-colour, Tableau style) |

**Stacking & grouping**: any bar/column/area series supports
`stacking: 'normal' | 'percent'`. Series sharing a `stack` id pile together;
otherwise same-type series are drawn side-by-side (grouped). **Combination
charts** work by giving each series its own `type`.

## Tableau-style small multiples (trellis)

Split one dataset into a grid of panels by data dimensions:

```ts
new JChart('#el', {
  chart: { type: 'column' },
  trellis: { columns: 'category', rows: 'region' },
  series: [{ name: 'Sales', data: [
    { x: 'Jan', y: 5, region: 'East', category: 'Tech' },
    // ...each point carries the dimension fields used to split panels
  ] }],
});
```

Each point's `region` / `category` fields route it into the matching panel.
By default (`table: true`) this renders as a **Tableau-style table**: one shared
y-axis on the left, one shared x-axis on the bottom, and the dimension values as
column headers (top) and row headers (right) — no repeated axes. Set
`trellis: { columns, rows, table: false }` for fully independent panels instead.

## Nested (hierarchical) x-axis

Put several dimensions on the x-axis; the measure (`y`) is aggregated per leaf:

```ts
xAxis: { dimensions: ['Region', 'Category'], aggregate: 'sum', opposite: true }
```

- Default: all dimension tiers stack below the plot.
- `opposite: true` → **split** layout: the innermost dimension is labelled at the
  bottom, the outer grouping dimensions move to the top, and full-height lines
  separate each top-level group (the classic Tableau look).

## Plot lines & bands

Reference lines and shaded ranges on either axis (x-axis → vertical, y-axis → horizontal):

```ts
yAxis: {
  plotBands: [{ from: 5, to: 7, color: 'rgba(0,200,120,0.1)', label: { text: 'target zone' } }],
  plotLines: [{ value: 6, color: '#e63946', width: 1.5, dashStyle: '5 4', label: { text: 'goal' } }],
}
```

## Theming

Pick a built-in theme or supply your own:

```ts
new JChart('#c', { theme: 'dark', series: [...] });          // light | dark | high-contrast | pastel

new JChart('#c', {                                            // custom, extending a built-in
  theme: {
    base: 'dark',
    backgroundColor: '#0b1021',
    colors: ['#00f5d4', '#f15bb5', '#fee440'],
    axis: { gridLineColor: '#1c2540', labelColor: '#8ea2c6' },
  },
  series: [...],
});
```

Explicit `colors` / `chart.backgroundColor` / axis colours still win over the
theme. Register reusable themes with `registerTheme(name, theme)`. Full token
list in the [API reference](docs/API.md#theming).

## Hover highlight

Points brighten subtly on hover. Scaling is opt-in (set `scale`); disable entirely with `enabled: false`:

```ts
series: [{ name: 'A', data: [...], states: { hover: { brightness: 0.1, scale: 1.1 } } }]
// or: states: { hover: { enabled: false } }
```

## Range charts

```ts
{ chart: { type: 'arearange' },
  series: [{ name: 'Temp', data: [['Jan', -3, 7], ['Feb', -1, 9]] }] } // [x, low, high]
```

## Full display control

Every chart part can be toggled and coloured through config:

```ts
{
  title: { text: 'Sales' },          // omit `text` to hide the title
  legend: { enabled: false },        // hide the legend
  xAxis: {
    visible: false,                  // hide the whole axis (no space reserved)
    opposite: true,                  // x-axis (and its labels) on TOP
    labels: { enabled: false },      // hide only the tick labels
  },
  yAxis: { opposite: true },         // y-axis on the RIGHT
  series: [
    { name: 'A', color: '#2caffe',   // colour the whole series
      data: [
        1,
        { y: 5, color: '#fe6a35' },  // colour a single data point
        3,
      ] },
  ],
}
```

Boxplots accept two distinct hues (or any of the sub-colours):

```ts
{ type: 'boxplot',
  series: [{ boxColors: { lower: '#74c0fc', upper: '#f08c4b', median: '#333', whisker: '#666' }, data: [...] }] }
```

## Dumbbell chart

```ts
{ chart: { type: 'dumbbell' },
  series: [{ lowColor: '#adb5bd', highColor: '#2caffe', connectorColor: '#ced4da',
             data: [['A', 20, 45], ['B', 35, 30]] }] } // [category, low, high]
```

## Configuration reference (abridged)

- `chart`: `type`, `width`, `height`, `backgroundColor`, `spacing`, `inverted`, `colors`, `events`
- `title` / `subtitle`: `text`, `align`, `style`
- `xAxis` / `yAxis` (or arrays for multiple axes): `categories`, `type` (`linear`/`log`/`category`), `title`, `min`, `max`, `tickCount`, `labels.formatter`, `gridLineWidth`, `reversed`
- `tooltip`: `enabled`, `format` (token string), `formatter` (callback), `valuePrefix/Suffix/Decimals`
- `legend`: `enabled`, `align`, `verticalAlign`
- `plotOptions`: per-type defaults, e.g. `{ column: { stacking: 'normal' } }`
- `series[]`: `type`, `name`, `data`, `color`, `stack`, `stacking`, `marker`, `dataLabels`, `innerSize` (pie/donut), `jitter`
- `trellis`: `columns`, `rows`, `gap`, `sharedX`, `sharedY`

### Tooltip format tokens

`{series}`, `{x}`, `{y}`, `{point.<field>}` — or supply `tooltip.formatter(ctx)`.

## Events / callbacks

```ts
const chart = new JChart('#el', {
  seriesEvents: {
    click:     (e) => console.log(e.seriesName, e.x, e.y, e.point),
    mouseOver: (e) => {},
    legendItemClick: ({ series, visible }) => {},
  },
  chart: { events: { render: (c) => {}, click: (e) => {} } },
  series: [/* ... */],
});

// Or subscribe imperatively (returns an unsubscribe fn):
chart.on('point:click', (e) => console.log(e));
```

Runtime methods: `chart.update(options)`, `chart.setSize(w, h)`,
`chart.destroy()`.

## Architecture

```
src/
  core/
    options.ts    Public config types (the API surface)
    chart.ts      Orchestrator: options → stacking/grouping → scales → panels
    renderer.ts   The ONLY module that touches the SVG DOM
    scale.ts      LinearScale / LogScale / CategoryScale (shared interface)
    axis.ts       Axis line, gridlines, ticks, labels, title
    point.ts      Normalises the many accepted point shapes
    tooltip.ts    HTML-overlay tooltip
    legend.ts     SVG legend + visibility toggling
    events.ts     Tiny typed event emitter
    colors.ts     Palette + shade/alpha helpers
    utils.ts      merge, niceTicks, formatting, seeded RNG
    defaults.ts   Default options + layout constants
  series/
    base.ts       Abstract BaseSeries + render context
    registry.ts   type → series-class map (extend here)
    column.ts     bar / column / range
    line.ts       line / spline / step
    area.ts       area / areaspline
    pie.ts        pie / donut
    scatter.ts    scatter / jitter
    boxplot.ts    boxplot (+ computeBoxStats)
    radialbar.ts  radial bars
    paths.ts      line/spline/step/area path builders
    marker.ts     point marker shapes
  index.ts        Public exports
```

### Adding a new chart type

1. Create `src/series/myType.ts` extending `BaseSeries` and implementing
   `capabilities()` + `render(ctx)`.
2. Register it in `src/series/registry.ts` (one line), or at runtime via
   `registerSeriesType('myType', MyTypeSeries)`.

The chart engine handles scales, stacking, grouping, tooltips, and events for
you — a series only turns normalised points into SVG.

## License

MIT
