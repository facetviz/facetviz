import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function bundle(name, contents) {
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile: `${name}.ts`, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    treeShaking: true,
    minify: true,
    metafile: true,
    write: false,
  });
  const bytes = result.outputFiles[0].contents;
  return {
    name,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    inputs: Object.keys(result.metafile.inputs),
  };
}

const core = await bundle('core-only', `
  import { FacetViz } from './src/core.ts';
  globalThis.FacetViz = FacetViz;
`);
const line = await bundle('line-only', `
  import { FacetViz } from './src/core.ts';
  import './src/entries/series/line.ts';
  globalThis.FacetViz = FacetViz;
`);
const full = await bundle('full', `
  import { FacetViz } from './src/index.ts';
  globalThis.FacetViz = FacetViz;
`);

const hasInput = (entry, suffix) =>
  entry.inputs.some((input) => input.endsWith(suffix));
const forbidden = [
  'src/series/column.ts',
  'src/series/pie.ts',
  'src/series/sankey.ts',
  'src/series/heatmap.ts',
];

if (hasInput(core, 'src/series/line.ts'))
  throw new Error('Core-only bundle unexpectedly contains the line renderer.');
if (!hasInput(line, 'src/series/line.ts'))
  throw new Error('Line-only bundle is missing the line renderer.');
for (const renderer of forbidden) {
  if (hasInput(line, renderer))
    throw new Error(`Line-only bundle unexpectedly contains ${renderer}.`);
  if (!hasInput(full, renderer))
    throw new Error(`Full bundle is missing ${renderer}.`);
}
if (line.gzipBytes >= full.gzipBytes * 0.8)
  throw new Error(
    `Line-only gzip bundle (${line.gzipBytes}) must be at least 20% smaller than full (${full.gzipBytes}).`,
  );

const report = [core, line, full].map(({ inputs, ...metrics }) => ({
  ...metrics,
  inputModules: inputs.length,
}));
console.log(`[modular-bundles] ${JSON.stringify(report)}`);
