import { defineConfig } from '@playwright/test';

const isCI = Boolean(
  (globalThis as { process?: { env?: { CI?: string } } }).process?.env?.CI,
);

export default defineConfig({
  testDir: './test/performance',
  testMatch: '**/*.performance.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175/test/performance/fixtures.html?scenario=svg',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  reporter: isCI
    ? [['line'], ['html', { outputFolder: 'playwright-performance-report', open: 'never' }]]
    : 'list',
});
