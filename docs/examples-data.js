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
const trellis = [];
for (const region of ["East", "West"])
  for (const cat of ["Tech", "Furniture"])
    for (const m of months)
      trellis.push({ x: m, y: Math.round(2 + Math.random() * 8), region, cat });

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
    desc: "Radial dial with coloured bands.",
    types: ["gauge"],
    cfg: {
      chart: { type: "gauge", height: 320 },
      title: { text: "Speed" },
      series: [
        {
          name: "km/h",
          min: 0,
          max: 120,
          data: [{ name: "km/h", y: 82 }],
          bands: [
            { from: 0, to: 60, color: "#26a69a" },
            { from: 60, to: 90, color: "#ffca28" },
            { from: 90, to: 120, color: "#ef5350" },
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
    cat: "Grid & hierarchy",
    title: "Calendar heatmap",
    desc: "Day-grid by date.",
    types: ["calendar"],
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
    title: "Trellis table",
    desc: "Small multiples, shared axes.",
    types: [],
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
    title: "Dual axis",
    desc: "Sales columns + Margin spline on the right.",
    types: [],
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
