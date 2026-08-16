// Shared example catalogue used by both the Examples page and the Guide.
// Each entry: { cat, title, desc, types:[chartType…], cfg }.

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const twoDim = [
  { Region: "Americas", Device: "Mobile", y: 30 },
  { Region: "Americas", Device: "Desktop", y: 22 },
  { Region: "EMEA", Device: "Mobile", y: 24 },
  { Region: "EMEA", Device: "Desktop", y: 18 },
  { Region: "APAC", Device: "Mobile", y: 28 },
  { Region: "APAC", Device: "Desktop", y: 12 },
];
const nested = [];
for (const r of ["East", "West", "Central"])
  for (const c of ["Tech", "Furniture", "Office"])
    nested.push({
      Region: r,
      Category: c,
      y: Math.round(5 + Math.random() * 20),
    });
// Each region's categories arrive in a different order — the axis should
// keep each region's own order rather than forcing all regions to share one.
const nestedOrdered = [];
for (const [r, cats] of [
  ["East", ["Tech", "Furniture", "Office"]],
  ["West", ["Office", "Tech", "Furniture"]],
  ["Central", ["Furniture", "Office", "Tech"]],
])
  for (const c of cats)
    nestedOrdered.push({
      Region: r,
      Category: c,
      y: Math.round(5 + Math.random() * 20),
    });
const trellis = [];
const trellisMargin = [];
const trellisSouth = [];
for (const region of ["East", "West"])
  for (const cat of ["Tech", "Furniture"])
    for (const m of months) {
      trellis.push({ x: m, y: Math.round(2 + Math.random() * 8), region, cat });
      trellisMargin.push({
        x: m,
        y: Math.round(40 + Math.random() * 20),
        region,
        cat,
      });
      trellisSouth.push({
        x: m,
        y: Math.round(2 + Math.random() * 8),
        region,
        cat,
      });
    }
const trellisBox = [];
for (const region of ["East", "West"])
  for (const cat of ["Tech", "Furniture"])
    for (const g of ["A", "B", "C"])
      trellisBox.push({
        x: g,
        min: 2,
        q1: 4 + Math.random() * 2,
        median: 6 + Math.random() * 2,
        q3: 8 + Math.random() * 2,
        max: 12,
        region,
        cat,
      });

/** URL-safe slug of a title (used as the example's anchor id). */
export const slug = (s) =>
  "ex-" +
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const EXAMPLES = [
  {
    cat: "Bars & columns",
    title: "Grouped column",
    desc: "Two series side-by-side.",
    types: ["column"],
    cfg: {
      chart: { type: "column", height: 300 },
      xAxis: { categories: months },
      yAxis: { title: { text: "Units" } },
      series: [
        { name: "North", data: [5, 3, 4, 7, 2, 6] },
        { name: "South", data: [2, 4, 6, 3, 5, 4] },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Overlapping bars",
    desc: "grouping: false draws each series full-width, on top of the last.",
    types: ["column"],
    cfg: {
      chart: { type: "column", height: 300 },
      title: { text: "Target vs. actual" },
      xAxis: { categories: months },
      yAxis: { title: { text: "Units" } },
      series: [
        {
          name: "Target",
          grouping: false,
          columnWidth: 34,
          color: "#d8dee9",
          data: [7, 6, 8, 9, 6, 8],
        },
        {
          name: "Actual",
          grouping: false,
          columnWidth: 16,
          data: [5, 3, 4, 7, 2, 6],
        },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Stacked column",
    desc: "stacking: 'normal'.",
    types: ["bar"],
    cfg: {
      chart: { type: "column", height: 300 },
      xAxis: { categories: months },
      series: [
        { name: "A", stacking: "normal", data: [5, 3, 4, 7, 2, 6] },
        { name: "B", stacking: "normal", data: [2, 4, 6, 3, 5, 4] },
        { name: "C", stacking: "normal", data: [3, 3, 3, 3, 3, 3] },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "100% stacked bar",
    desc: "Horizontal, stacking: 'percent'.",
    types: [],
    cfg: {
      chart: { type: "bar", height: 300 },
      xAxis: { categories: months },
      series: [
        { name: "A", stacking: "percent", data: [5, 3, 4, 7, 2, 6] },
        { name: "B", stacking: "percent", data: [2, 4, 6, 3, 5, 4] },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Waterfall",
    desc: "Running cumulative with a sum bar.",
    types: ["waterfall"],
    cfg: {
      chart: { type: "waterfall", height: 300 },
      title: { text: "Cash flow" },
      xAxis: { categories: ["Start", "Sales", "Refunds", "Services", "Net"] },
      yAxis: { title: { text: "$k" } },
      series: [
        {
          name: "Flow",
          data: [
            { x: "Start", y: 120 },
            { x: "Sales", y: 80 },
            { x: "Refunds", y: -30 },
            { x: "Services", y: 45 },
            { x: "Net", isSum: true },
          ],
        },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Histogram",
    desc: "Bins raw numbers.",
    types: ["histogram"],
    cfg: {
      chart: { type: "histogram", height: 300 },
      title: { text: "Distribution" },
      series: [
        {
          name: "obs",
          data: Array.from(
            { length: 400 },
            () => (Math.random() + Math.random() + Math.random()) * 33,
          ),
        },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Bullet",
    desc: "Measure vs. target + qualitative bands.",
    types: ["bullet"],
    cfg: {
      chart: { type: "bullet", height: 220 },
      title: { text: "KPIs" },
      series: [
        {
          name: "KPI",
          data: [
            { name: "Revenue", y: 275, target: 250, ranges: [150, 225, 300] },
            { name: "Profit", y: 22, target: 26, ranges: [20, 25, 30] },
          ],
        },
      ],
    },
  },
  {
    cat: "Bars & columns",
    title: "Marimekko",
    desc: "Variable-width 100% stacked columns.",
    types: ["marimekko"],
    tall: true,
    cfg: {
      chart: { type: "marimekko", height: 320 },
      title: { text: "Share by segment" },
      xAxis: { categories: ["Enterprise", "SMB", "Consumer"] },
      series: [
        { name: "A", data: [40, 20, 10] },
        { name: "B", data: [25, 30, 25] },
        { name: "C", data: [15, 25, 45] },
      ],
    },
  },

  {
    cat: "Lines & areas",
    title: "Line / spline / step",
    desc: "Three line variants together.",
    types: ["line", "spline", "step"],
    cfg: {
      chart: { height: 300 },
      xAxis: { categories: months },
      yAxis: { title: { text: "Value" } },
      series: [
        {
          type: "line",
          name: "Line",
          marker: { enabled: true },
          data: [3, 5, 4, 7, 6, 8],
        },
        { type: "spline", name: "Spline", data: [2, 4, 3, 6, 5, 7] },
        { type: "step", name: "Step", data: [1, 3, 2, 5, 4, 6] },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Stacked area",
    desc: "stacking: 'normal'.",
    types: ["area", "areaspline"],
    cfg: {
      chart: { type: "area", height: 300 },
      xAxis: { categories: months },
      series: [
        { name: "A", stacking: "normal", data: [3, 4, 3, 5, 4, 6] },
        { name: "B", stacking: "normal", data: [2, 3, 4, 3, 5, 4] },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Area range",
    desc: "Filled band between low & high.",
    types: ["arearange", "areasplinerange"],
    cfg: {
      chart: { type: "arearange", height: 300 },
      title: { text: "Temperature range" },
      xAxis: { categories: months },
      yAxis: { title: { text: "°C" } },
      series: [
        {
          name: "Temp",
          data: [
            ["Jan", -3, 7],
            ["Feb", -1, 9],
            ["Mar", 2, 12],
            ["Apr", 5, 16],
            ["May", 9, 20],
            ["Jun", 13, 24],
          ],
        },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Line with min/max range",
    desc: "Shaded min–max band behind an actual-value line.",
    types: ["arearange", "line"],
    cfg: {
      chart: { type: "line", height: 300 },
      title: { text: "Daily temperature" },
      xAxis: { categories: months },
      yAxis: { title: { text: "°C" } },
      tooltip: { shared: true },
      series: [
        {
          name: "Range",
          type: "arearange",
          color: "#2caffe",
          lineWidth: 0,
          data: [
            ["Jan", -3, 7],
            ["Feb", -1, 9],
            ["Mar", 2, 12],
            ["Apr", 5, 16],
            ["May", 9, 20],
            ["Jun", 13, 24],
          ],
        },
        {
          name: "Average",
          type: "line",
          color: "#4338ca",
          marker: { enabled: true },
          data: [2, 4, 7, 10, 14, 18],
        },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Column range",
    desc: "Rounded-capsule low→high bars.",
    types: ["columnrange"],
    cfg: {
      chart: { type: "columnrange", height: 300 },
      title: { text: "Temp range" },
      xAxis: { categories: months },
      yAxis: { title: { text: "°C" } },
      series: [
        {
          name: "Range",
          color: "#fe6a35",
          dataLabels: { enabled: true },
          data: [
            ["Jan", -2, 7],
            ["Feb", -1, 9],
            ["Mar", 2, 12],
            ["Apr", 5, 16],
            ["May", 9, 20],
            ["Jun", 13, 24],
          ],
        },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Plot lines & bands",
    desc: "Reference line + shaded band.",
    types: [],
    cfg: {
      chart: { height: 300 },
      xAxis: { categories: months },
      yAxis: {
        title: { text: "Value" },
        plotBands: [
          {
            from: 5,
            to: 7,
            color: "rgba(0,200,120,0.1)",
            label: { text: "target" },
          },
        ],
        plotLines: [
          {
            value: 6,
            color: "#e63946",
            dashStyle: "5 4",
            label: { text: "goal" },
          },
        ],
      },
      series: [{ type: "spline", name: "S", data: [3, 5, 4, 7, 6, 8] }],
    },
  },

  {
    cat: "Circular",
    title: "Pie with labels",
    desc: "Leader lines to each slice.",
    types: ["pie"],
    cfg: {
      chart: { type: "pie", height: 320 },
      title: { text: "Browser share" },
      series: [
        {
          name: "Share",
          dataLabels: { enabled: true },
          data: [
            { name: "Chrome", y: 63 },
            { name: "Safari", y: 19 },
            { name: "Edge", y: 5 },
            { name: "Firefox", y: 4 },
            { name: "Other", y: 9 },
          ],
        },
      ],
    },
  },
  {
    cat: "Circular",
    title: "Donut — two dimensions",
    desc: "Inner ring Region ▸ outer Device.",
    types: ["donut"],
    cfg: {
      chart: { type: "donut", height: 340 },
      title: { text: "Sessions" },
      series: [
        {
          name: "Sessions",
          innerSize: "35%",
          dimensions: ["Region", "Device"],
          dataLabels: { enabled: true, format: "{name}" },
          data: twoDim,
        },
      ],
    },
  },
  {
    cat: "Circular",
    title: "Variable-radius pie",
    desc: "z drives each slice radius.",
    types: [],
    cfg: {
      chart: { type: "pie", height: 320 },
      title: { text: "Share × intensity" },
      series: [
        {
          name: "V",
          dataLabels: { enabled: true, format: "{name}" },
          data: [
            { name: "A", y: 30, z: 100 },
            { name: "B", y: 25, z: 60 },
            { name: "C", y: 25, z: 90 },
            { name: "D", y: 20, z: 40 },
          ],
        },
      ],
    },
  },
  {
    cat: "Circular",
    title: "Radial bar",
    desc: "Bars around a polar centre (0→270°).",
    types: ["radialbar"],
    cfg: {
      chart: { type: "radialbar", height: 320 },
      title: { text: "Activity" },
      series: [
        {
          name: "Goals",
          data: [
            { name: "Move", y: 80 },
            { name: "Exercise", y: 55 },
            { name: "Stand", y: 95 },
          ],
        },
      ],
    },
  },
  {
    cat: "Circular",
    title: "Gauge",
    desc: "A radial dial for every value in the series.",
    types: ["gauge"],
    cfg: {
      chart: { type: "gauge", height: 320 },
      title: { text: "Service health" },
      plotOptions: {
        gauge: {
          color: "#26a69a",
          markers: [{ value: 80, label: "Target", fontSize: "12px" }],
        },
      },
      series: [
        {
          name: "Utilization",
          min: 0,
          max: 100,
          data: [
            { name: "API", y: 82 },
            { name: "Workers", y: 64 },
            { name: "Database", y: 91 },
          ],
        },
      ],
    },
  },
  {
    cat: "Circular",
    title: "Sunburst",
    desc: "Multi-level radial hierarchy.",
    types: ["sunburst"],
    tall: true,
    cfg: {
      chart: { type: "sunburst", height: 340 },
      title: { text: "Org" },
      series: [
        {
          name: "Org",
          data: [
            { id: "eng", name: "Eng" },
            { id: "fe", parent: "eng", name: "FE", value: 8 },
            { id: "be", parent: "eng", name: "BE", value: 12 },
            { id: "sales", name: "Sales" },
            { id: "in", parent: "sales", name: "In", value: 6 },
            { id: "out", parent: "sales", name: "Out", value: 5 },
            { id: "ops", name: "Ops", value: 4 },
          ],
        },
      ],
    },
  },

  {
    cat: "Points",
    title: "Scatter",
    desc: "Point cloud.",
    types: ["scatter"],
    cfg: {
      chart: { type: "scatter", height: 300 },
      xAxis: { title: { text: "x" } },
      yAxis: { title: { text: "y" } },
      series: [
        {
          name: "A",
          data: [
            [1, 2],
            [2, 5],
            [3, 3],
            [4, 8],
            [5, 6],
            [6, 9],
          ],
        },
        {
          name: "B",
          data: [
            [1, 6],
            [2, 3],
            [3, 7],
            [4, 4],
            [5, 9],
            [6, 5],
          ],
        },
      ],
    },
  },
  {
    cat: "Points",
    title: "Jitter",
    desc: "Categorical scatter with spread.",
    types: ["jitter"],
    cfg: {
      chart: { type: "jitter", height: 300 },
      xAxis: { categories: ["A", "B", "C"] },
      series: [
        {
          name: "obs",
          data: (() => {
            const d = [];
            ["A", "B", "C"].forEach((c) => {
              for (let i = 0; i < 20; i++)
                d.push({ x: c, y: Math.round(Math.random() * 10) });
            });
            return d;
          })(),
        },
      ],
    },
  },
  {
    cat: "Points",
    title: "Bubble",
    desc: "z → marker size (by area).",
    types: ["bubble"],
    cfg: {
      chart: { type: "bubble", height: 320 },
      xAxis: { title: { text: "GDP/capita" } },
      yAxis: { title: { text: "Life expectancy" } },
      series: [
        {
          name: "Countries",
          data: [
            { x: 12, y: 72, z: 80 },
            { x: 45, y: 81, z: 320 },
            { x: 28, y: 76, z: 140 },
            { x: 60, y: 83, z: 60 },
            { x: 8, y: 65, z: 210 },
            { x: 35, y: 79, z: 25 },
          ],
        },
      ],
    },
  },
  {
    cat: "Points",
    title: "Dumbbell",
    desc: "Two connected points per category.",
    types: ["dumbbell"],
    cfg: {
      chart: { type: "dumbbell", height: 300 },
      xAxis: { categories: ["A", "B", "C", "D", "E"] },
      yAxis: { title: { text: "Value" } },
      series: [
        {
          name: "Change",
          lowColor: "#adb5bd",
          highColor: "#2caffe",
          dataLabels: { enabled: true },
          data: [
            ["A", 20, 45],
            ["B", 35, 30],
            ["C", 10, 55],
            ["D", 40, 60],
            ["E", 25, 35],
          ],
        },
      ],
    },
  },
  {
    cat: "Points",
    title: "Dumbbell (inverted)",
    desc: "Two connected points per category.",
    types: ["dumbbell"],
    cfg: {
      chart: { type: "dumbbell", height: 300, inverted: true },
      xAxis: { categories: ["A", "B", "C", "D", "E"] },
      yAxis: { title: { text: "Value" } },
      series: [
        {
          name: "Change",
          lowColor: "#adb5bd",
          highColor: "#2caffe",
          dataLabels: { enabled: true },
          data: [
            ["A", 45, 20],
            ["B", 30, 35],
            ["C", 55, 10],
            ["D", 60, 40],
            ["E", 35, 25],
          ],
        },
      ],
    },
  },
  {
    cat: "Points",
    title: "Lollipop",
    desc: "Zero-anchored stem + marker per category, a lighter column.",
    types: ["lollipop"],
    cfg: {
      chart: { type: "lollipop", height: 300 },
      title: { text: "Monthly change" },
      xAxis: { categories: months },
      yAxis: { title: { text: "Units" } },
      series: [
        {
          name: "Sales",
          dataLabels: { enabled: true },
          data: [5, -3, 8, 6, -2, 4],
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Slope",
    desc: "One line per series across two (or more) x-categories — before/after comparison.",
    types: ["slope"],
    cfg: {
      chart: { type: "slope", height: 340 },
      title: { text: "Share of segment: 2020 vs 2024" },
      xAxis: { categories: ["2020", "2024"] },
      yAxis: { title: { text: "Share %" } },
      series: [
        { name: "Product A", dataLabels: { enabled: true }, data: [30, 45] },
        { name: "Product B", dataLabels: { enabled: true }, data: [50, 32] },
        { name: "Product C", dataLabels: { enabled: true }, data: [20, 38] },
      ],
    },
  },
  {
    cat: "Lines & areas",
    title: "Sparkline",
    desc: "Bare trend line for a table cell — no axes, last point highlighted.",
    types: ["sparkline"],
    cfg: {
      chart: { type: "sparkline", height: 60 },
      series: [
        {
          name: "Trend",
          sparkline: { min: true, max: true },
          data: [5, 8, 6, 9, 12, 10, 14, 13, 16],
        },
      ],
    },
  },
  {
    cat: "FacetTable",
    title: "Basic FacetTable",
    desc: "A semantic value table with formatting, sorting, filtering, and column styles.",
    types: [],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Product summary",
      rows: [
        { product: "Atlas", region: "North America", revenue: 128400, growth: { value: 12.4, prefix: "+", suffix: "%", color: "#16a34a", fontWeight: 700 } },
        { product: "Beacon", region: "Europe", revenue: 86900, growth: { value: 7.1, prefix: "+", suffix: "%", color: "#16a34a" } },
        { product: "Comet", region: "Asia Pacific", revenue: 54200, growth: { value: -2.8, suffix: "%", color: "#dc2626" } },
        { product: "Delta", region: "Latin America", revenue: 97600, growth: { value: 15.2, prefix: "+", suffix: "%", color: "#16a34a" } },
      ],
      columns: [
        { key: "product", header: "Product", sortable: true, filterable: { placeholder: "Find product" }, style: { fontWeight: 600 } },
        { key: "region", header: "Region", sortable: true, filterable: true },
        { key: "revenue", header: "Revenue", role: "value", format: "{value:$,.0f}", sortable: true, style: { color: "#1d4ed8" }, headerStyle: { backgroundColor: "#dbeafe", color: "#1e3a8a" } },
        { key: "growth", header: "Growth", role: "value", horizontalAlign: "right" },
      ],
      layout: { rowDensity: "comfortable", wrapText: false },
      appearance: {
        rowsAndColumns: {
          bandedRows: true,
          bandedRowsAlternateColor: "#f8fafc",
          highlightRowOnHover: true,
          hoverColor: "#eef2ff",
        },
        borders: { horizontalBorders: true, borderColor: "#e2e8f0" },
      },
      style: { table: { fontSize: "13px" } },
    },
  },
  {
    cat: "FacetTable",
    title: "Charts in table cells",
    desc: "Filterable, sortable columns with per-cell styles beside paginated sparklines.",
    types: [],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Product performance",
      rows: [
        {
          product: "Atlas",
          revenue: {
            value: 128400,
            color: "#b91c1c",
            backgroundColor: "#fef2f2",
            fontWeight: 900,
          },
          growth: {
            value: 12.4,
            prefix: "+",
            suffix: "%",
            color: "#16a34a",
            fontWeight: 700,
          },
          trend: [64, 69, 72, 70, 78, 82, 86, 91, 96, 104, 112, 128],
        },
        {
          product: "Beacon",
          revenue: 86900,
          growth: "+7.1%",
          trend: [48, 51, 49, 54, 58, 57, 61, 63, 60, 66, 72, 87],
        },
        {
          product: "Comet",
          revenue: 54200,
          growth: "−2.8%",
          trend: [38, 41, 45, 43, 47, 50, 49, 46, 44, 48, 52, 54],
        },
        {
          product: "Delta",
          revenue: 97600,
          growth: "+15.2%",
          trend: [52, 55, 59, 63, 61, 68, 72, 75, 81, 86, 91, 98],
        },
        {
          product: "Echo",
          revenue: 43700,
          growth: "−5.4%",
          trend: [49, 47, 50, 48, 46, 45, 47, 44, 43, 45, 42, 44],
        },
        {
          product: "Flux",
          revenue: 71300,
          growth: "+3.6%",
          trend: [57, 60, 58, 62, 65, 63, 67, 69, 68, 72, 70, 71],
        },
      ],
      columns: [
        { key: "product", header: "Product", width: 120, horizontalAlign: "left", verticalAlign: "top", sortable: true, filterable: { placeholder: "Find product" } },
        {
          key: "revenue",
          header: "Revenue",
          width: 110,
          horizontalAlign: "right",
          verticalAlign: "bottom",
          format: "{value:$,.0f}",
          sortable: true,
          filterable: true,
          style: { color: "#1d4ed8" },
          headerStyle: { backgroundColor: "#dbeafe", color: "#1e3a8a" },
        },
        { key: "growth", header: "YoY", width: 80, horizontalAlign: "center", verticalAlign: "middle", filterable: true, style: { fontWeight: 600 } },
        {
          key: "trend",
          header: "12-month trend",
          width: 240,
          chart: {
            type: "sparkline",
            height: 38,
            scale: "shared",
            options: {
              plotOptions: {
                sparkline: {
                  color: "#6366f1",
                  lineWidth: 2,
                  sparkline: { min: true, max: true },
                },
              },
              tooltip: { valuePrefix: "$", valueSuffix: "k" },
            },
          },
        },
      ],
      pagination: {
        pageSize: 3,
        pageSizeOptions: [3, 6],
        align: "right",
      },
      style: {
        headerCell: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" },
        sortIndicator: { color: "#6366f1" },
        filterIndicator: { color: "#6366f1" },
        pagination: { fontSize: "11px" },
        paginationButton: { padding: "3px 7px" },
        activePageButton: { background: "#6366f1" },
      },
    },
  },
  {
    cat: "FacetTable",
    title: "Multi-series charts in table cells",
    desc: "Column and line series combined inside each FacetTable cell.",
    types: ["column", "line"],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Quarterly actual versus target",
      rows: [
        {
          product: "Atlas",
          comparison: [
            { type: "column", name: "Actual", color: "#6366f1", data: [22, 28, 31, 38] },
            { type: "line", name: "Target", color: "#f97316", lineWidth: 2, marker: { enabled: true }, data: [24, 27, 33, 36] },
          ],
        },
        {
          product: "Beacon",
          comparison: [
            { type: "column", name: "Actual", color: "#6366f1", data: [18, 24, 23, 30] },
            { type: "line", name: "Target", color: "#f97316", lineWidth: 2, marker: { enabled: true }, data: [20, 22, 26, 29] },
          ],
        },
      ],
      columns: [
        { key: "product", header: "Product", width: 120, sortable: true },
        {
          key: "comparison",
          header: "Actual + target",
          width: 360,
          chart: {
            type: "column",
            height: 104,
            minWidth: 280,
            scale: "shared",
            series: "value",
            options: {
              xAxis: { categories: ["Q1", "Q2", "Q3", "Q4"] },
              legend: { enabled: true, align: "center" },
              tooltip: { shared: true, valueSuffix: "k" },
            },
          },
        },
      ],
      style: {
        headerCell: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" },
        sortIndicator: { color: "#6366f1" },
      },
    },
  },
  {
    cat: "FacetTable",
    title: "Pre-grouped rows with subtotals",
    desc: "Render database-prepared detail, subtotal, and grand-total rows with group-safe sorting and a chart column.",
    types: ["bar"],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Category sales summary",
      rows: [
        { category: "Beverages", product: "Bread", city: "Bengaluru", unitPrice: 86.29, revenue: 949.19, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread", city: "Chennai", unitPrice: 1128.37, revenue: 36797.68, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread — subtotal", city: "", unitPrice: 1214.66, revenue: 37746.87, rowType: "subtotal", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages — subtotal", product: "", city: "", unitPrice: 1214.66, revenue: 37746.87, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", city: "Chennai", unitPrice: 442.04, revenue: 13261.2, rowType: "detail", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Bread — subtotal", city: "", unitPrice: 442.04, revenue: 13261.2, rowType: "subtotal", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Detergent", city: "Chennai", unitPrice: 537.24, revenue: 8189.82, rowType: "detail", groupPath: ["Grocery", "Detergent"] },
        { category: "Grocery", product: "Detergent — subtotal", city: "", unitPrice: 537.24, revenue: 8189.82, rowType: "subtotal", groupPath: ["Grocery", "Detergent"] },
        { category: "Grocery — subtotal", product: "", city: "", unitPrice: 979.28, revenue: 21451.02, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand total", product: "", city: "", unitPrice: 2193.94, revenue: 59197.89, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category", header: "Category" },
        { key: "product", header: "Product" },
        { key: "city", header: "City" },
        { key: "unitPrice", header: "SUM(UnitPrice)", role: "value", format: "{value:,.2f}" },
        { key: "revenue", header: "SUM(Revenue)", role: "value", format: "{value:,.2f}", sortable: true },
        {
          key: "revenue",
          header: "Revenue chart",
          role: "value",
          width: 180,
          chart: {
            type: "bar",
            height: 28,
            scale: "shared",
            options: {
              plotOptions: { bar: { color: "#6366f1", borderRadius: 4 } },
              tooltip: { valuePrefix: "$" },
            },
          },
        },
      ],
      layout: { rowDensity: "comfortable", wrapText: false },
      appearance: {
        rowsAndColumns: { highlightRowOnHover: true, hoverColor: "#eef2ff" },
        borders: { horizontalBorders: true, borderColor: "#e2e8f0" },
      },
      style: {
        subtotalRow: { backgroundColor: "var(--panel-2, #f8fafc)", color: "var(--text, #334155)", fontWeight: 700 },
        grandTotalRow: { backgroundColor: "color-mix(in srgb, var(--panel, #fff) 86%, #6366f1 14%)", color: "var(--text, #0f172a)", fontWeight: 800 },
      },
    },
  },

  {
    cat: "FacetTable",
    title: "Precomputed average grand total",
    desc: "Supply the database-calculated average for every subtotal and the grand-total row; FacetTable displays the values unchanged.",
    types: [],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Average unit price by category",
      rows: [
        { category: "Beverages", product: "Bread", city: "Bengaluru", unitPrice: 10, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread", city: "Chennai", unitPrice: 20, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread — subtotal", city: "", unitPrice: 15, rowType: "subtotal", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages — subtotal", product: "", city: "", unitPrice: 15, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", city: "Chennai", unitPrice: 100, rowType: "detail", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Bread — subtotal", city: "", unitPrice: 100, rowType: "subtotal", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery — subtotal", product: "", city: "", unitPrice: 100, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand average", product: "", city: "", unitPrice: 43.33, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category", header: "Category" },
        { key: "product", header: "Product" },
        { key: "city", header: "City" },
        {
          key: "unitPrice",
          header: "AVG(UnitPrice)",
          role: "value",
          format: "{value:,.2f}",
          sortable: true,
        },
      ],
      layout: { rowDensity: "comfortable", wrapText: false },
      appearance: {
        rowsAndColumns: { highlightRowOnHover: true, hoverColor: "#eef2ff" },
        borders: { horizontalBorders: true, borderColor: "#e2e8f0" },
      },
      style: {
        subtotalRow: { backgroundColor: "var(--panel-2, #f8fafc)", color: "var(--text, #334155)", fontWeight: 700 },
        grandTotalRow: { backgroundColor: "color-mix(in srgb, var(--panel, #fff) 86%, #6366f1 14%)", color: "var(--text, #0f172a)", fontWeight: 800 },
      },
    },
  },
  {
    cat: "FacetTable",
    title: "Multi-level headers with nested measures",
    desc: "Pivot-style city headers span Revenue and Average Price measures while leaf columns remain sortable and formattable.",
    types: [],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Revenue and average price by city",
      rows: [
        { category: "Beverages", product: "Bread", bengaluruRevenue: 949.19, bengaluruAverage: 86.29, chennaiRevenue: 36797.68, chennaiAverage: 1128.37, totalRevenue: 37746.87, totalAverage: 607.33, rowType: "detail", groupPath: ["Beverages"] },
        { category: "Beverages — subtotal", product: "", bengaluruRevenue: 949.19, bengaluruAverage: 86.29, chennaiRevenue: 36797.68, chennaiAverage: 1128.37, totalRevenue: 37746.87, totalAverage: 607.33, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", bengaluruRevenue: null, bengaluruAverage: null, chennaiRevenue: 13261.2, chennaiAverage: 442.04, totalRevenue: 13261.2, totalAverage: 442.04, rowType: "detail", groupPath: ["Grocery"] },
        { category: "Grocery", product: "Detergent", bengaluruRevenue: null, bengaluruAverage: null, chennaiRevenue: 8189.82, chennaiAverage: 537.24, totalRevenue: 8189.82, totalAverage: 537.24, rowType: "detail", groupPath: ["Grocery"] },
        { category: "Grocery — subtotal", product: "", bengaluruRevenue: null, bengaluruAverage: null, chennaiRevenue: 21451.02, chennaiAverage: 489.64, totalRevenue: 21451.02, totalAverage: 489.64, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand total", product: "", bengaluruRevenue: 949.19, bengaluruAverage: 86.29, chennaiRevenue: 58248.7, chennaiAverage: 702.55, totalRevenue: 59197.89, totalAverage: 548.49, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category", header: "Category", width: 180 },
        { key: "product", header: "Product", width: 130 },
        {
          header: "Bengaluru",
          columns: [
            { key: "bengaluruRevenue", header: "Revenue", role: "value", format: "{value:,.2f}", sortable: true },
            { key: "bengaluruAverage", header: "Average Price", role: "value", format: "{value:,.2f}", sortable: true },
          ],
        },
        {
          header: "Chennai",
          columns: [
            { key: "chennaiRevenue", header: "Revenue", role: "value", format: "{value:,.2f}", sortable: true },
            { key: "chennaiAverage", header: "Average Price", role: "value", format: "{value:,.2f}", sortable: true },
          ],
        },
        {
          header: "Grand total",
          headerStyle: { backgroundColor: "color-mix(in srgb, var(--panel-2, #f8fafc) 75%, #6366f1 25%)" },
          columns: [
            { key: "totalRevenue", header: "Revenue", role: "value", format: "{value:,.2f}", sortable: true },
            { key: "totalAverage", header: "Average Price", role: "value", format: "{value:,.2f}", sortable: true },
          ],
        },
      ],
      layout: { rowDensity: "comfortable", wrapText: false, freezeHeaderRow: true },
      appearance: {
        rowsAndColumns: { displayEmptyCellAs: "—", valueAlignment: "right", highlightRowOnHover: true, hoverColor: "#eef2ff" },
        borders: { horizontalBorders: true, verticalBorders: true, borderColor: "#e2e8f0" },
      },
      style: {
        columnGroupHeader: { textAlign: "center", fontWeight: 800 },
        subtotalRow: { backgroundColor: "var(--panel-2, #f8fafc)", fontWeight: 700 },
        grandTotalRow: { backgroundColor: "color-mix(in srgb, var(--panel, #fff) 86%, #6366f1 14%)", fontWeight: 800 },
      },
    },
  },
  {
    cat: "FacetTable",
    title: "Pivot table with bar chart cells",
    desc: "Nested city groups combine formatted revenue values with comparable horizontal bar charts.",
    types: ["bar"],
    kind: "table",
    wide: true,
    cfg: {
      caption: "City revenue with in-cell bars",
      rows: [
        { category: "Beverages", product: "Bread", bengaluruRevenue: 949.19, chennaiRevenue: 36797.68, rowType: "detail", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", bengaluruRevenue: 0, chennaiRevenue: 13261.2, rowType: "detail", groupPath: ["Grocery"] },
        { category: "Grocery", product: "Detergent", bengaluruRevenue: 0, chennaiRevenue: 8189.82, rowType: "detail", groupPath: ["Grocery"] },
        { category: "Grand total", product: "", bengaluruRevenue: 949.19, chennaiRevenue: 58248.7, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category", header: "Category", width: 150 },
        { key: "product", header: "Product", width: 110 },
        {
          header: "Bengaluru",
          columns: [
            { key: "bengaluruRevenue", header: "Revenue", role: "value", format: "{value:$,.2f}", sortable: true },
            {
              key: "bengaluruRevenue",
              header: "Revenue bar",
              role: "value",
              width: 170,
              chart: {
                type: "bar",
                height: 30,
                minWidth: 140,
                scale: "shared",
                options: {
                  plotOptions: { bar: { color: "#6366f1", borderRadius: 4 } },
                  tooltip: { valuePrefix: "$", valueDecimals: 2 },
                },
              },
            },
          ],
        },
        {
          header: "Chennai",
          columns: [
            { key: "chennaiRevenue", header: "Revenue", role: "value", format: "{value:$,.2f}", sortable: true },
            {
              key: "chennaiRevenue",
              header: "Revenue bar",
              role: "value",
              width: 170,
              chart: {
                type: "bar",
                height: 30,
                minWidth: 140,
                scale: "shared",
                options: {
                  plotOptions: { bar: { color: "#14b8a6", borderRadius: 4 } },
                  tooltip: { valuePrefix: "$", valueDecimals: 2 },
                },
              },
            },
          ],
        },
      ],
      layout: { rowDensity: "compact", wrapText: false },
      appearance: {
        rowsAndColumns: { valueAlignment: "right", highlightRowOnHover: true, hoverColor: "#eef2ff" },
        borders: { horizontalBorders: true, verticalBorders: true, borderColor: "#e2e8f0" },
      },
      style: {
        columnGroupHeader: { textAlign: "center", fontWeight: 800 },
        grandTotalRow: { backgroundColor: "color-mix(in srgb, var(--panel, #fff) 86%, #6366f1 14%)", fontWeight: 800 },
      },
    },
  },
  {
    cat: "FacetTable",
    title: "Fully customized FacetTable",
    desc: "Density, sticky headers/columns, banding, hover, alignment, empty cells, and borders.",
    types: [],
    kind: "table",
    wide: true,
    cfg: {
      caption: "Regional product performance",
      rows: [
        { region: "North America", product: "Atlas Enterprise", revenue: 128400, margin: 0.284, notes: null, trend: [18, 22, 24, 29, 31, 38], status: "Ahead" },
        { region: "Europe", product: "Beacon Cloud", revenue: 86900, margin: 0.219, notes: "Renewal due next quarter", trend: [14, 17, 16, 21, 24, 27], status: "On track" },
        { region: "Asia Pacific", product: "Comet Mobile", revenue: 54200, margin: 0.176, notes: null, trend: [12, 15, 18, 17, 20, 22], status: "Watch" },
        { region: "Latin America", product: "Delta Services", revenue: 97600, margin: 0.251, notes: "New partner channel", trend: [16, 19, 23, 25, 28, 32], status: "Ahead" },
        { region: "Middle East", product: "Echo Analytics", revenue: 43700, margin: 0.143, notes: null, trend: [13, 12, 15, 14, 16, 17], status: "Watch" },
        { region: "Africa", product: "Flux Commerce", revenue: 71300, margin: 0.198, notes: "Pilot market expansion", trend: [11, 14, 13, 18, 20, 24], status: "On track" },
      ],
      columns: [
        { key: "region", header: "Region", role: "dimension", width: 150, sortable: true },
        { key: "product", header: "Product", role: "dimension", width: 170, sortable: true },
        { key: "revenue", header: "Revenue", role: "value", width: 115, format: "{value:$,.0f}", sortable: true },
        { key: "margin", header: "Margin", role: "value", width: 90, format: "{value:.1%}" },
        { key: "notes", header: "Notes", role: "dimension", width: 190 },
        { key: "trend", header: "Trend", role: "value", width: 190, chart: { height: 30, minWidth: 150, scale: "shared" } },
        { key: "status", header: "Status", role: "dimension", width: 100 },
      ],
      layout: {
        tableLayout: "fixed",
        rowDensity: "compact",
        bodyTextSize: 12,
        showHeaderRow: true,
        wrapText: false,
        freezeHeaderRow: true,
        freezeFirstColumn: true,
      },
      appearance: {
        headerRow: {
          fillColor: "#312e81",
          textColor: "#ffffff",
          textSize: 11,
          alignment: "center",
          bold: true,
          italic: true,
        },
        rowsAndColumns: {
          textColor: "#1f2937",
          rowFill: "#ffffff",
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
      },
      style: {
        root: { maxHeight: 250, borderRadius: 6 },
        table: { minWidth: 1005 },
      },
    },
  },
  {
    cat: "Points",
    title: "Timeline",
    desc: "Events along a line.",
    types: ["timeline"],
    cfg: {
      chart: { type: "timeline", height: 280 },
      title: { text: "Roadmap" },
      legend: { enabled: false },
      series: [
        {
          name: "Milestones",
          data: [
            { x: "2023", name: "Kickoff" },
            { x: "2024", name: "Beta" },
            { x: "2025", name: "GA" },
            { x: "2026", name: "v2" },
          ],
        },
      ],
    },
  },

  {
    cat: "Statistical",
    title: "Boxplot",
    desc: "Five-number distribution, dual-colour.",
    types: ["boxplot"],
    cfg: {
      chart: { type: "boxplot", height: 300 },
      xAxis: { categories: ["A", "B", "C", "D"] },
      series: [
        {
          name: "obs",
          boxColors: { lower: "#74c0fc", upper: "#f08c4b" },
          data: [
            { min: 2, q1: 4, median: 5, q3: 6.5, max: 8 },
            { min: 1, q1: 4.5, median: 6, q3: 8, max: 12 },
            { min: 3, q1: 5.5, median: 6, q3: 7.5, max: 10 },
            { min: 0, q1: 3, median: 6, q3: 9, max: 14 },
          ],
        },
      ],
    },
  },
  {
    cat: "Statistical",
    title: "Candlestick",
    desc: "OHLC financial candles.",
    types: ["candlestick"],
    cfg: {
      chart: { type: "candlestick", height: 300 },
      xAxis: { categories: months },
      yAxis: { title: { text: "Price" } },
      series: [
        {
          name: "ACME",
          data: [
            { x: "Jan", open: 100, high: 108, low: 98, close: 106 },
            { x: "Feb", open: 106, high: 110, low: 101, close: 103 },
            { x: "Mar", open: 103, high: 105, low: 95, close: 97 },
            { x: "Apr", open: 97, high: 104, low: 96, close: 102 },
            { x: "May", open: 102, high: 112, low: 100, close: 110 },
            { x: "Jun", open: 110, high: 114, low: 107, close: 108 },
          ],
        },
      ],
    },
  },
  {
    cat: "Statistical",
    title: "Error bars",
    desc: "Column + overlaid errorbar series.",
    types: ["errorbar"],
    cfg: {
      chart: { type: "column", height: 300 },
      xAxis: { categories: months },
      series: [
        { name: "Mean", data: [5, 6, 4, 8, 7, 9] },
        {
          type: "errorbar",
          name: "Error",
          color: "#333",
          data: [
            ["Jan", 4, 6],
            ["Feb", 5, 7.5],
            ["Mar", 3, 5],
            ["Apr", 7, 9],
            ["May", 6, 8],
            ["Jun", 8, 10],
          ],
        },
      ],
    },
  },

  {
    cat: "Grid & hierarchy",
    title: "Heatmap",
    desc: "Category × category, coloured by value.",
    types: ["heatmap"],
    cfg: {
      chart: { type: "heatmap", height: 300 },
      title: { text: "Activity" },
      series: [
        {
          name: "Activity",
          color: "#2caffe",
          data: [
            { x: "Mon", y: "AM", value: 74 },
            { x: "Mon", y: "PM", value: 40 },
            { x: "Tue", y: "AM", value: 38 },
            { x: "Tue", y: "PM", value: 55 },
            { x: "Wed", y: "AM", value: 35 },
            { x: "Wed", y: "PM", value: 89 },
            { x: "Thu", y: "AM", value: 53 },
            { x: "Thu", y: "PM", value: 27 },
          ],
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Inverted polar axes",
    desc: "A radial x-axis and circular y-axis with concentric arc columns.",
    types: [],
    cfg: {
      chart: {
        type: "column",
        polar: true,
        inverted: true,
        polarInnerSize: "18%",
        polarInnerBackgroundColor: "#ffffff",
        height: 350,
      },
      title: { text: "Completion by tier" },
      xAxis: {
        categories: ["Inner", "Middle", "Outer"],
        title: { text: "Tier" },
      },
      yAxis: {
        min: 0,
        max: 100,
        tickCount: 5,
        title: { text: "Completion" },
      },
      series: [
        {
          name: "Progress",
          data: [
            { x: "Inner", y: 35, color: "#22c55e" },
            { x: "Middle", y: 62, color: "#38bdf8" },
            { x: "Outer", y: 84, color: "#7c3aed" },
          ],
        },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Calendar heatmap",
    desc: "Day-grid by date.",
    types: ["calendar"],
    tall: true,
    cfg: {
      chart: { type: "calendar", height: 220 },
      title: { text: "Commits" },
      legend: { enabled: false },
      series: [
        {
          name: "Commits",
          color: "#2caffe",
          data: (() => {
            const o = [];
            const t0 = Date.UTC(2026, 0, 1);
            for (let i = 0; i < 84; i++)
              o.push({
                date: t0 + i * 86400000,
                value: Math.round(Math.random() * 10),
              });
            return o;
          })(),
        },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Funnel",
    desc: "Narrowing stages sized by value.",
    types: ["funnel"],
    cfg: {
      chart: { type: "funnel", height: 320 },
      title: { text: "Conversion" },
      legend: { enabled: false },
      series: [
        {
          name: "Users",
          data: [
            { name: "Visits", y: 1500 },
            { name: "Signups", y: 900 },
            { name: "Trials", y: 500 },
            { name: "Paid", y: 220 },
          ],
        },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Treegraph",
    desc: "Hierarchy from id/parent.",
    types: ["treegraph"],
    tall: true,
    cfg: {
      chart: { type: "treegraph", height: 320 },
      title: { text: "Org chart" },
      series: [
        {
          name: "Org",
          data: [
            { id: "ceo", name: "CEO" },
            { id: "cto", parent: "ceo", name: "CTO" },
            { id: "cfo", parent: "ceo", name: "CFO" },
            { id: "eng", parent: "cto", name: "Eng" },
            { id: "qa", parent: "cto", name: "QA" },
            { id: "fin", parent: "cfo", name: "Finance" },
          ],
        },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Sankey",
    desc: "Weighted flows between nodes.",
    types: ["sankey"],
    tall: true,
    cfg: {
      chart: { type: "sankey", height: 340 },
      title: { text: "Energy flow" },
      legend: { enabled: false },
      series: [
        {
          name: "Flow",
          data: [
            { from: "Coal", to: "Grid", weight: 40 },
            { from: "Solar", to: "Grid", weight: 25 },
            { from: "Wind", to: "Grid", weight: 20 },
            { from: "Grid", to: "Homes", weight: 45 },
            { from: "Grid", to: "Industry", weight: 40 },
          ],
        },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Gantt",
    desc: "Duration bars per row.",
    types: ["gantt"],
    tall: true,
    cfg: {
      chart: { type: "gantt", height: 260 },
      title: { text: "Project plan" },
      legend: { enabled: false },
      series: [
        {
          name: "Tasks",
          data: [
            {
              name: "Research",
              start: Date.UTC(2026, 0, 1),
              end: Date.UTC(2026, 0, 8),
            },
            {
              name: "Design",
              start: Date.UTC(2026, 0, 8),
              end: Date.UTC(2026, 0, 20),
            },
            {
              name: "Build",
              start: Date.UTC(2026, 0, 20),
              end: Date.UTC(2026, 1, 6),
            },
            {
              name: "Launch",
              start: Date.UTC(2026, 1, 6),
              end: Date.UTC(2026, 1, 14),
            },
          ],
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Polar projection with annotation",
    desc: "Ordinary column series projected onto angular and radial axes.",
    types: [],
    cfg: {
      chart: {
        type: "column",
        polar: true,
        polarInnerSize: "44%",
        polarInnerBackgroundColor: "#ffffff",
        polarGridLineMode: "sector",
        height: 350,
      },
      title: {
        text: "Revenue by direction",
        margin: 10,
      },
      xAxis: {
        categories: ["North", "East", "South", "West"],
        labels: { maxWidth: 70, position: "inner", offset: 10 },
        title: { text: "Region", position: "center" },
      },
      yAxis: { title: { text: "Revenue", margin: 10 } },
      annotations: [
        {
          x: "East",
          y: 72,
          text: "Strongest region",
          shape: "callout",
          dx: 18,
          dy: -18,
        },
      ],
      responsive: [
        {
          condition: { maxWidth: 440 },
          options: {
            legend: { enabled: false },
            title: { margin: 4 },
          },
        },
      ],
      series: [
        { name: "Current", data: [48, 72, 55, 61] },
        { name: "Previous", data: [42, 64, 52, 57] },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Radar",
    desc: "Line/area over categories on a polar grid.",
    types: ["radar"],
    cfg: {
      chart: { type: "radar", height: 340 },
      title: { text: "Skills" },
      xAxis: {
        categories: [
          "Speed",
          "Power",
          "Range",
          "Control",
          "Stamina",
          "Agility",
        ],
      },
      series: [
        { name: "Alpha", data: [8, 6, 7, 9, 5, 8] },
        { name: "Bravo", type: "area", data: [6, 8, 5, 6, 9, 6] },
      ],
    },
  },
  {
    cat: "Grid & hierarchy",
    title: "Butterfly",
    desc: "Two series mirrored around a centre.",
    types: ["butterfly"],
    cfg: {
      chart: { type: "butterfly", height: 320 },
      title: { text: "Population pyramid" },
      xAxis: { categories: ["0–17", "18–34", "35–54", "55–74", "75+"] },
      series: [
        { name: "Male", color: "#2caffe", data: [30, 42, 38, 28, 18] },
        { name: "Female", color: "#fe6a35", data: [28, 40, 39, 30, 22] },
      ],
    },
  },

  {
    cat: "Advanced",
    title: "Nested x-axis",
    desc: "Two dimensions on x, headers on top.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 340 },
      title: { text: "Sales by Region ▸ Category" },
      xAxis: {
        dimensions: ["Region", "Category"],
        aggregate: "sum",
        opposite: true,
      },
      yAxis: { title: { text: "Sum of Sales" } },
      series: [{ name: "Sales", data: nested }],
    },
  },
  {
    cat: "Advanced",
    title: "Nested x-axis (per-group order)",
    desc: "Each region keeps its own categories' data order instead of sharing one order.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 340 },
      title: { text: "Sales by Region ▸ Category" },
      xAxis: { dimensions: ["Region", "Category"], aggregate: "sum" },
      yAxis: { title: { text: "Sum of Sales" } },
      series: [{ name: "Sales", data: nestedOrdered }],
    },
  },
  {
    cat: "Advanced",
    title: "Nested x-axis (horizontal bar)",
    desc: "Category axis runs vertically on the left; value axis along the bottom.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "bar", height: 340 },
      title: { text: "Sales by Region ▸ Category" },
      xAxis: { dimensions: ["Region", "Category"], aggregate: "sum" },
      yAxis: { title: { text: "Sum of Sales" } },
      series: [{ name: "Sales", data: nested }],
    },
  },
  {
    cat: "Advanced",
    title: "Trellis table",
    desc: "Small multiples, shared axes.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 380 },
      title: { text: "Sales small multiples" },
      xAxis: { title: { text: "Month" } },
      yAxis: { title: { text: "Sales" } },
      trellis: { columns: "cat", rows: "region" },
      series: [{ name: "Sales", data: trellis }],
    },
  },
  {
    cat: "Advanced",
    title: "Trellis table (dual axis)",
    desc: "Small multiples with a secondary y-axis for a differently-scaled measure.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 380 },
      title: { text: "Sales vs Margin % small multiples" },
      xAxis: { title: { text: "Month" } },
      yAxis: [{ title: { text: "Sales" } }, { title: { text: "Margin %" } }],
      trellis: { columns: "cat", rows: "region" },
      series: [
        { name: "Sales", data: trellis },
        {
          type: "line",
          name: "Margin %",
          yAxis: 1,
          color: "#e8590c",
          marker: { enabled: true },
          data: trellisMargin,
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Trellis table (stacked column)",
    desc: "Small multiples with stacked series per cell.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 380 },
      title: { text: "Sales by team, small multiples" },
      xAxis: { title: { text: "Month" } },
      yAxis: { title: { text: "Sales" } },
      trellis: { columns: "cat", rows: "region" },
      series: [
        { name: "North", stacking: "normal", data: trellis },
        { name: "South", stacking: "normal", data: trellisSouth },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Trellis table (bar)",
    desc: "Small multiples of horizontal bars — the category axis moves to the left, values along the bottom.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "bar", height: 380 },
      title: { text: "Sales small multiples (horizontal)" },
      xAxis: { title: { text: "Month" } },
      yAxis: { title: { text: "Sales" } },
      trellis: { columns: "cat", rows: "region" },
      series: [{ name: "Sales", data: trellis }],
    },
  },
  {
    cat: "Advanced",
    title: "Trellis table (boxplot)",
    desc: "Small multiples of distributions, one box per group per cell.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "boxplot", height: 380 },
      title: { text: "Distributions, small multiples" },
      yAxis: { title: { text: "Value" } },
      trellis: { columns: "cat", rows: "region" },
      series: [{ name: "Distribution", data: trellisBox }],
    },
  },
  {
    cat: "Advanced",
    title: "Dual axis (combo)",
    desc: "Bars + line on a differently-scaled secondary axis.",
    types: [],
    cfg: {
      chart: { type: "column", height: 300 },
      title: { text: "Units vs Margin %" },
      xAxis: { categories: months },
      yAxis: [{ title: { text: "Units" } }, { title: { text: "Margin %" } }],
      series: [
        { type: "column", name: "Units", data: [120, 145, 110, 165, 130, 158] },
        {
          type: "spline",
          name: "Margin %",
          yAxis: 1,
          color: "#00b894",
          marker: { enabled: true },
          data: [12, 14, 11, 19, 15, 21],
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Dual axis (nested x-axis)",
    desc: "Sales columns + Margin spline on the right, over a nested x-axis.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "column", height: 340 },
      title: { text: "Sales & Margin" },
      xAxis: { dimensions: ["Region", "Category"], aggregate: "sum" },
      yAxis: [
        { title: { text: "Sum of Sales" } },
        { title: { text: "Margin %" } },
      ],
      series: [
        { name: "Sales", data: nested },
        {
          type: "spline",
          name: "Margin %",
          yAxis: 1,
          color: "#00b894",
          marker: { enabled: true },
          data: nested.map((d) => ({
            Region: d.Region,
            Category: d.Category,
            y: 40 + Math.round(Math.random() * 45),
          })),
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Drill-down",
    desc: "Click a column to expand.",
    types: [],
    cfg: {
      chart: { type: "column", height: 300 },
      title: { text: "Fruit → varieties" },
      legend: { enabled: false },
      xAxis: { categories: ["Apples", "Pears", "Bananas"] },
      series: [
        {
          name: "Fruit",
          data: [
            { y: 12, name: "Apples", drilldown: "apples" },
            { y: 8, name: "Pears", drilldown: "pears" },
            { y: 15, name: "Bananas" },
          ],
        },
      ],
      drilldown: {
        series: [
          {
            id: "apples",
            name: "Apple varieties",
            data: [
              ["Gala", 5],
              ["Fuji", 4],
              ["Granny", 3],
            ],
          },
          {
            id: "pears",
            name: "Pear varieties",
            data: [
              ["Bartlett", 5],
              ["Bosc", 3],
            ],
          },
        ],
      },
    },
  },
  {
    cat: "Advanced",
    title: "Datetime + zoom + crosshair",
    desc: "Drag on the plot to zoom.",
    types: [],
    cfg: {
      chart: { type: "line", height: 300, zoom: "x" },
      title: { text: "Drag to zoom" },
      xAxis: { type: "datetime", crosshair: true },
      yAxis: { title: { text: "Value" } },
      tooltip: { shared: true, format: "{x:%b %d}<br/><b>{y}</b>" },
      series: [
        {
          name: "Signal",
          marker: { enabled: true },
          data: (() => {
            const o = [];
            const t0 = Date.UTC(2026, 0, 1);
            for (let i = 0; i < 40; i++)
              o.push([
                t0 + i * 86400000,
                Math.round(50 + 30 * Math.sin(i / 4) + Math.random() * 8),
              ]);
            return o;
          })(),
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Boost — 30,000 points",
    desc: "High-volume canvas rendering.",
    types: [],
    tall: true,
    cfg: {
      chart: { type: "scatter", height: 320 },
      title: { text: "30k points on one canvas" },
      xAxis: { title: { text: "x" } },
      yAxis: { title: { text: "y" } },
      series: [
        {
          name: "Cloud",
          color: "#2caffe",
          data: Array.from({ length: 30000 }, () => {
            const a = Math.random() * 6.28,
              r = Math.random() * 50;
            return [
              50 + r * Math.cos(a) + (Math.random() - 0.5) * 20,
              50 + r * Math.sin(a),
            ];
          }),
        },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Light theme",
    desc: "theme: 'light' (the default theme).",
    types: [],
    cfg: {
      chart: { type: "column", height: 300 },
      theme: "light",
      title: { text: "Sales" },
      xAxis: { categories: months },
      yAxis: { title: { text: "Units" } },
      series: [
        { name: "North", data: [5, 3, 4, 7, 2, 6] },
        { name: "South", data: [2, 4, 6, 3, 5, 4] },
      ],
    },
  },
  {
    cat: "Advanced",
    title: "Dark theme",
    desc: "theme: 'dark'.",
    types: [],
    cfg: {
      chart: { type: "column", height: 300 },
      theme: "dark",
      title: { text: "Sales" },
      xAxis: { categories: months },
      yAxis: { title: { text: "Units" } },
      series: [
        { name: "North", data: [5, 3, 4, 7, 2, 6] },
        { name: "South", data: [2, 4, 6, 3, 5, 4] },
      ],
    },
  },
];

/** Map a chart type → the anchor of the first example that demonstrates it. */
export const TYPE_TO_EXAMPLE = (() => {
  const m = {};
  for (const ex of EXAMPLES)
    for (const t of ex.types) if (!m[t]) m[t] = slug(ex.title);
  return m;
})();
