import { FacetViz, type ChartOptions, type ChartType, type ThemeInput } from '../../src/index.ts';

const categories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const baseChart = { width: 418, height: 278, animation: false, reflow: false } as const;
const stableTheme = { base: 'light', fontFamily: 'Arial, sans-serif' } as ThemeInput;
const DAY = 86_400_000;
const JAN_1_2026 = Date.UTC(2026, 0, 1);

type Fixture = { type: ChartType; options: ChartOptions; className?: string };

const fixture = (
  type: ChartType,
  options: Omit<ChartOptions, 'series'> & Pick<ChartOptions, 'series'>,
  className?: string,
): Fixture => ({
  type,
  className,
  options: {
    ...options,
    chart: { ...baseChart, type, ...options.chart },
    title: options.title ?? { text: type },
    theme: options.theme ?? stableTheme,
  },
});

const lineData = [3, 6, 4, 8, 5, 9];
const rangeData = categories.map((x, i) => [x, i - 2, i + 5] as [string, number, number]);

const fixtures: Fixture[] = [
  fixture('bar', { xAxis: { categories }, series: [{ name: 'North', data: [5, -3, 4, 7, 2, 6] }, { name: 'South', data: [2, 4, 6, 3, 5, 4] }] }),
  fixture('column', { xAxis: { categories }, series: [{ name: 'North', data: [5, 3, 4, 7, 2, 6] }, { name: 'South', data: [2, 4, 6, 3, 5, 4] }] }),
  fixture('arearange', { xAxis: { categories }, series: [{ name: 'Range', data: rangeData }] }),
  fixture('areasplinerange', { xAxis: { categories }, series: [{ name: 'Range', data: rangeData }] }),
  fixture('line', { xAxis: { categories }, series: [{ name: 'Trend', marker: { enabled: true }, data: lineData }] }),
  fixture('spline', { xAxis: { categories }, series: [{ name: 'Trend', marker: { enabled: true }, data: lineData }] }),
  fixture('step', { xAxis: { categories }, series: [{ name: 'Trend', marker: { enabled: true }, data: lineData }] }),
  fixture('area', { xAxis: { categories }, series: [{ name: 'Actual', data: lineData }, { name: 'Forecast', data: [2, 3, 5, 4, 7, 6] }] }),
  fixture('areaspline', { xAxis: { categories }, series: [{ name: 'Actual', data: lineData }, { name: 'Forecast', data: [2, 3, 5, 4, 7, 6] }] }),
  fixture('pie', { series: [{ name: 'Share', dataLabels: { enabled: true }, data: [{ name: 'Alpha', y: 38 }, { name: 'Beta', y: 27 }, { name: 'Gamma', y: 21 }, { name: 'Delta', y: 14 }] }] }),
  fixture('donut', { series: [{ name: 'Share', innerSize: '45%', dataLabels: { enabled: true }, data: [{ name: 'Alpha', y: 38 }, { name: 'Beta', y: 27 }, { name: 'Gamma', y: 21 }, { name: 'Delta', y: 14 }] }] }),
  fixture('scatter', { xAxis: { title: { text: 'x' } }, yAxis: { title: { text: 'y' } }, series: [{ name: 'Samples', data: [[1, 2], [2, 5], [3, 3], [4, 8], [5, 6], [6, 9]] }] }),
  fixture('jitter', { xAxis: { categories: ['A', 'B', 'C'] }, series: [{ name: 'Samples', data: ['A', 'B', 'C'].flatMap((x, xi) => [1, 3, 5, 7, 9].map((y, i) => ({ x, y: y + ((xi + i) % 3) }))) }] } as ChartOptions),
  fixture('boxplot', { xAxis: { categories: ['A', 'B', 'C', 'D'] }, series: [{ name: 'Distribution', data: [{ min: 2, q1: 4, median: 5, q3: 7, max: 9 }, { min: 1, q1: 3, median: 6, q3: 8, max: 11 }, { min: 3, q1: 5, median: 7, q3: 9, max: 12 }, { min: 2, q1: 6, median: 8, q3: 10, max: 14 }] }] }),
  fixture('dumbbell', { xAxis: { categories: ['A', 'B', 'C', 'D'] }, series: [{ name: 'Change', data: [['A', 20, 45], ['B', 35, 30], ['C', 10, 55], ['D', 40, 60]] }] }),
  fixture('lollipop', { xAxis: { categories }, series: [{ name: 'Change', dataLabels: { enabled: true }, data: [5, -3, 8, 6, -2, 4] }] }),
  fixture('slope', { xAxis: { categories: ['2020', '2026'] }, series: [{ name: 'Alpha', data: [30, 45] }, { name: 'Beta', data: [50, 32] }, { name: 'Gamma', data: [20, 38] }] }),
  fixture('butterfly', { xAxis: { categories: ['0–17', '18–34', '35–54', '55+'] }, series: [{ name: 'Left', data: [30, 42, 38, 24] }, { name: 'Right', data: [28, 40, 39, 31] }] }),
  fixture('columnrange', { xAxis: { categories }, series: [{ name: 'Temperature', data: rangeData }] }),
  fixture('radialbar', { series: [{ name: 'Goals', data: [{ name: 'Move', y: 80 }, { name: 'Exercise', y: 55 }, { name: 'Stand', y: 95 }] }] }),
  fixture('heatmap', { series: [{ name: 'Activity', data: ['Mon', 'Tue', 'Wed', 'Thu'].flatMap((x, xi) => ['AM', 'PM', 'Night'].map((y, yi) => ({ x, y, value: 20 + xi * 17 + yi * 11 }))) }] } as unknown as ChartOptions),
  fixture('bullet', { series: [{ name: 'KPIs', data: [{ name: 'Revenue', y: 275, target: 250, ranges: [150, 225, 300] }, { name: 'Profit', y: 22, target: 26, ranges: [20, 25, 30] }] }] }),
  fixture('candlestick', { xAxis: { categories }, series: [{ name: 'ACME', data: [{ x: 'Jan', open: 100, high: 108, low: 98, close: 106 }, { x: 'Feb', open: 106, high: 110, low: 101, close: 103 }, { x: 'Mar', open: 103, high: 105, low: 95, close: 97 }, { x: 'Apr', open: 97, high: 104, low: 96, close: 102 }, { x: 'May', open: 102, high: 112, low: 100, close: 110 }, { x: 'Jun', open: 110, high: 114, low: 107, close: 108 }] }] }),
  fixture('gauge', { series: [{ name: 'km/h', min: 0, max: 120, bands: [{ from: 0, to: 60, color: '#26a69a' }, { from: 60, to: 90, color: '#ffca28' }, { from: 90, to: 120, color: '#ef5350' }], data: [{ name: 'km/h', y: 82 }] }] }),
  fixture('waterfall', { xAxis: { categories: ['Start', 'Sales', 'Refunds', 'Services', 'Net'] }, series: [{ name: 'Flow', data: [{ x: 'Start', y: 120 }, { x: 'Sales', y: 80 }, { x: 'Refunds', y: -30 }, { x: 'Services', y: 45 }, { x: 'Net', isSum: true }] }] }),
  fixture('histogram', { series: [{ name: 'Observations', binCount: 8, data: Array.from({ length: 64 }, (_, i) => ((i * 17) % 31) + ((i * 7) % 9) / 10) }] }),
  fixture('timeline', { legend: { enabled: false }, series: [{ name: 'Roadmap', data: [{ x: '2023', name: 'Kickoff' }, { x: '2024', name: 'Beta' }, { x: '2025', name: 'GA' }, { x: '2026', name: 'v2' }] }] }),
  fixture('funnel', { legend: { enabled: false }, series: [{ name: 'Users', data: [{ name: 'Visits', y: 1500 }, { name: 'Signups', y: 900 }, { name: 'Trials', y: 500 }, { name: 'Paid', y: 220 }] }] }),
  fixture('treegraph', { series: [{ name: 'Org', data: [{ id: 'ceo', name: 'CEO' }, { id: 'cto', parent: 'ceo', name: 'CTO' }, { id: 'cfo', parent: 'ceo', name: 'CFO' }, { id: 'eng', parent: 'cto', name: 'Eng' }, { id: 'qa', parent: 'cto', name: 'QA' }, { id: 'fin', parent: 'cfo', name: 'Finance' }] }] }),
  fixture('bubble', { xAxis: { title: { text: 'GDP' } }, yAxis: { title: { text: 'Life expectancy' } }, series: [{ name: 'Countries', data: [{ x: 12, y: 72, z: 80 }, { x: 45, y: 81, z: 320 }, { x: 28, y: 76, z: 140 }, { x: 60, y: 83, z: 60 }, { x: 8, y: 65, z: 210 }] }] }),
  fixture('radar', { xAxis: { categories: ['Speed', 'Power', 'Range', 'Control', 'Stamina'] }, series: [{ name: 'Alpha', data: [8, 6, 7, 9, 5] }, { name: 'Bravo', data: [6, 8, 5, 6, 9] }] }),
  fixture('sunburst', { series: [{ name: 'Org', data: [{ id: 'eng', name: 'Eng' }, { id: 'fe', parent: 'eng', name: 'FE', value: 8 }, { id: 'be', parent: 'eng', name: 'BE', value: 12 }, { id: 'sales', name: 'Sales' }, { id: 'inside', parent: 'sales', name: 'Inside', value: 6 }, { id: 'field', parent: 'sales', name: 'Field', value: 5 }] }] }),
  fixture('sankey', { legend: { enabled: false }, series: [{ name: 'Flow', data: [{ from: 'Coal', to: 'Grid', weight: 40 }, { from: 'Solar', to: 'Grid', weight: 25 }, { from: 'Wind', to: 'Grid', weight: 20 }, { from: 'Grid', to: 'Homes', weight: 45 }, { from: 'Grid', to: 'Industry', weight: 40 }] }] }),
  fixture('calendar', { legend: { enabled: false }, series: [{ name: 'Commits', data: Array.from({ length: 84 }, (_, i) => ({ date: JAN_1_2026 + i * DAY, value: (i * 7 + i % 5) % 12 })) }] }),
  fixture('gantt', { legend: { enabled: false }, series: [{ name: 'Tasks', data: [{ name: 'Research', start: JAN_1_2026, end: JAN_1_2026 + 7 * DAY }, { name: 'Design', start: JAN_1_2026 + 7 * DAY, end: JAN_1_2026 + 19 * DAY }, { name: 'Build', start: JAN_1_2026 + 19 * DAY, end: JAN_1_2026 + 36 * DAY }, { name: 'Launch', start: JAN_1_2026 + 36 * DAY, end: JAN_1_2026 + 44 * DAY }] }] }),
  fixture('marimekko', { xAxis: { categories: ['Enterprise', 'SMB', 'Consumer'] }, series: [{ name: 'Alpha', data: [40, 20, 10] }, { name: 'Beta', data: [25, 30, 25] }, { name: 'Gamma', data: [15, 25, 45] }] }),
  fixture('errorbar', { chart: { type: 'column' }, xAxis: { categories }, series: [{ name: 'Mean', data: [5, 6, 4, 8, 7, 9] }, { type: 'errorbar', name: 'Error', color: '#333333', data: categories.map((x, i) => [x, [5, 6, 4, 8, 7, 9][i] - 1, [5, 6, 4, 8, 7, 9][i] + 1]) }] } as ChartOptions),
  fixture('sparkline', { chart: { width: 418, height: 92 }, series: [{ name: 'Trend', sparkline: { min: true, max: true }, data: [5, 8, 6, 9, 12, 10, 14, 13, 16] }] }, 'sparkline'),
];

const themeNames = ['light', 'dark', 'high-contrast', 'pastel'] as const;
const themeFixtures = themeNames.map((name) => fixture('column', {
  title: { text: `${name} theme` },
  xAxis: { categories: ['A', 'B', 'C', 'D'] },
  theme: { base: name, fontFamily: 'Arial, sans-serif' },
  series: [{ name: 'Primary', data: [3, 7, 5, 9] }, { name: 'Secondary', data: [6, 4, 8, 5] }],
}));

const params = new URLSearchParams(location.search);
const requestedType = params.get('type');
const requestedTheme = params.get('theme');
const mode = params.get('mode');
const root = document.querySelector<HTMLElement>('#fixtures')!;
const status = document.querySelector<HTMLElement>('#status')!;

function mount(id: string, label: string, item: Fixture, className = ''): FacetViz {
  const card = document.createElement('section');
  card.className = `fixture-card ${item.className ?? ''} ${className}`.trim();
  card.dataset.fixture = id;
  const heading = document.createElement('h1');
  heading.className = 'fixture-label';
  heading.textContent = label;
  const chart = document.createElement('div');
  chart.className = 'chart';
  card.append(heading, chart);
  root.append(card);
  return new FacetViz(chart, item.options);
}

if (requestedTheme) {
  const index = themeNames.indexOf(requestedTheme as (typeof themeNames)[number]);
  if (index < 0) throw new Error(`Unknown theme fixture: ${requestedTheme}`);
  mount(`theme-${requestedTheme}`, `${requestedTheme} theme`, themeFixtures[index]);
} else if (mode === 'responsive') {
  const item = fixture('line', {
    chart: { width: 218, height: 178, responsive: true },
    title: { text: 'Compact' },
    xAxis: { categories },
    series: [{ name: 'Trend', data: lineData }],
  });
  mount('responsive', 'responsive 218 × 178', item, 'compact');
} else if (mode === 'update') {
  const item = fixture('column', {
    title: { text: 'Live values' },
    xAxis: { categories: ['A', 'B', 'C', 'D'] },
    series: [{ name: 'Before', data: [3, 7, 5, 9] }],
  });
  const chart = mount('update', 'update state', item);
  const button = document.createElement('button');
  button.id = 'apply-update';
  button.textContent = 'Apply update';
  button.style.marginTop = '12px';
  button.addEventListener('click', () => {
    chart.update({ title: { text: 'Updated values' }, series: [{ name: 'After', data: [8, 4, 10, 6] }] });
    document.body.dataset.updated = 'true';
  });
  document.body.append(button);
} else {
  const item = fixtures.find((candidate) => candidate.type === requestedType);
  if (!item) throw new Error(`Unknown chart fixture: ${requestedType}`);
  mount(item.type, item.type, item);
}

status.textContent = 'ready';
document.body.dataset.ready = 'true';
