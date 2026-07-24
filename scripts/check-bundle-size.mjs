import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const bundle = readFileSync(new URL('../docs/lib/facetviz.js', import.meta.url));
const metrics = {
  rawBytes: bundle.byteLength,
  gzipBytes: gzipSync(bundle, { level: 9 }).byteLength,
};
const budgets = { rawBytes: 296_500, gzipBytes: 70_750 };

console.log(`[bundle-size] ${JSON.stringify({ ...metrics, budgets })}`);

for (const key of Object.keys(budgets)) {
  if (metrics[key] > budgets[key]) {
    throw new Error(
      `FacetViz bundle ${key} is ${metrics[key]} bytes; budget is ${budgets[key]} bytes`,
    );
  }
}
