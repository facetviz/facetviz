# FacetViz

A modular, dependency-free **TypeScript + SVG** charting library with
**a declarative config API**, small multiples (trellising), and a wide
range of chart types. Designed to be read and maintained by hand — every chart
type, scale, and helper is a small, self-contained module.

🌐 **Documentation website** — the [`docs/`](docs/) folder is a self-contained GitHub Pages site with
a shared top nav across four pages: **Guide** ([index.html](docs/index.html) — tutorial + concepts),
**Examples** ([examples.html](docs/examples.html) — every chart type, chart on the left with a
click-to-reveal config on the right), **API** ([api.html](docs/api.html) — the reference with a
section-nav sidebar), and the interactive **Playground**. Once Pages is enabled it is served at
`https://<user>.github.io/<repo>/`.

📖 **[Full API reference → docs/API.md](docs/API.md)** — every option key and value documented.

🎛️ **Playground** — [`docs/playground.html`](docs/playground.html): a live JSON config editor on
the left, the rendered chart on the right, with 25+ presets.

### Publishing the docs site

The site under `docs/` is fully self-contained — no CDN. `docs/lib/` holds the vendored assets:
the bundled library (`facetviz.js`), plus `marked.esm.js` and `highlight.min.js` / `hljs-github-dark.css`
used to render the API reference and highlight code. Regenerate the library bundle whenever the
library changes:

```bash
npm run build:site   # bundles src/index.ts → docs/lib/facetviz.js
```

Then either commit `docs/` and enable **GitHub Pages → Deploy from branch → `main` / `docs`**, or use
the included workflow ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)) which rebuilds the
bundle and deploys on every push to `main` (set Pages source to **GitHub Actions**).

```ts
import { FacetViz } from 'facetviz';

new FacetViz('#container', {
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
| Bars | `column`, `bar`, `waterfall`, `histogram`, `bullet`, `marimekko` |
| Lines | `line`, `spline`, `step`, `area`, `areaspline`, `radar` |
| Range | `arearange`, `areasplinerange`, `columnrange` (capsule), `errorbar` |
| Circular | `pie`, `donut` (multi-level + variable radius), `radialbar`, `gauge`, `sunburst` |
| Points | `scatter`, `jitter`, `bubble`, `dumbbell`, `timeline` |
| Statistical | `boxplot` (dual-colour), `candlestick` |
| Grid / hierarchy | `heatmap`, `calendar`, `funnel`, `treegraph`, `sankey`, `gantt`, `butterfly` |

**Stacking & grouping**: any bar/column/area series supports
`stacking: 'normal' | 'percent'`. Series sharing a `stack` id pile together;
otherwise same-type series are drawn side-by-side (grouped). **Combination
charts** work by giving each series its own `type`.

## Small multiples (trellis)

Split one dataset into a grid of panels by data dimensions:

```ts
new FacetViz('#el', {
  chart: { type: 'column' },
  trellis: { columns: 'category', rows: 'region' },
  series: [{ name: 'Sales', data: [
    { x: 'Jan', y: 5, region: 'East', category: 'Tech' },
    // ...each point carries the dimension fields used to split panels
  ] }],
});
```

Each point's `region` / `category` fields route it into the matching panel.
By default (`table: true`) this renders as a **cross-tab table**: one shared
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
  separate each top-level group (the classic nested-axis look).

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
new FacetViz('#c', { theme: 'dark', series: [...] });          // light | dark | high-contrast | pastel

new FacetViz('#c', {                                            // custom, extending a built-in
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

## Interactivity & data

```ts
new FacetViz('#c', {
  chart: {
    animation: true,        // enter animation (bars grow, lines draw in) — default on
    zoom: 'x',              // drag-select on the plot to zoom the x-axis
    reflow: true,           // auto re-render when the container resizes (default on)
  },
  xAxis: { type: 'datetime', crosshair: true },  // date ticks + hover guide line
  series: [{ name: 'S', data: [[Date.UTC(2026,0,1), 5], /* … */] }],
  drilldown: { series: [{ id: 'apples', name: 'Apples', data: [['Gala', 5]] }] },
});
```

- **Drill-down** — give a point `drilldown: '<id>'` and list the child series under
  `drilldown.series`; clicking expands it, with an automatic **← Back** control.
- **Export** — `chart.getSVG()`, `chart.downloadSVG()`, `chart.downloadPNG()`, `chart.toPNGBlob()`.
- **Live updates** — `chart.setData(i, data)`, `chart.addPoint(i, point)`, `chart.update(options)`.
- **Accessibility** — the root SVG gets `role="img"`, an `aria-label`, and a `<title>` (from the chart
  title or `accessibility.description`).

### High-volume data (boost)

Point/line series (`scatter`, `bubble`, `line`, `spline`, `step`, `area`) with more than
`boost.threshold` points (default 1500) are automatically drawn to a **single canvas overlay**
instead of one SVG node per point, and lines are **min/max-decimated** to the pixel resolution.
Hover uses a nearest-point lookup, so tooltips still work without per-point listeners.

```ts
chart: { boost: true }                 // force on
chart: { boost: { threshold: 5000 } }  // raise the auto threshold
chart: { boost: false }                // always use SVG
```

In practice this takes **100,000 scatter points from “freezes the tab” to ~100 ms and ~40 DOM
nodes** (vs. thousands of nodes + seconds in plain SVG). Axes, gridlines and the legend stay SVG.
Note: boosted marks are canvas, so they aren't captured by `getSVG()` (use `downloadPNG()` to
rasterise a boosted chart).

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
- `series[]`: `type`, `name`, `data`, `color`, `visible`, `showInLegend`, `stack`, `stacking`, `marker`, `dataLabels`, `innerSize` (pie/donut), `jitter`
- `trellis`: `columns`, `rows`, `gap`, `sharedX`, `sharedY`

### Tooltip format tokens

`{series}`, `{x}`, `{y}`, `{point.<field>}` — or supply `tooltip.formatter(ctx)`.

## Events / callbacks

```ts
const chart = new FacetViz('#el', {
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
