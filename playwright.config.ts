import { defineConfig } from '@playwright/test';

const isCI = Boolean(
  (globalThis as { process?: { env?: { CI?: string } } }).process?.env?.CI,
);

export default defineConfig({
  testDir: './test/visual',
  testMatch: '**/*.visual.spec.ts',
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/test/visual/fixtures.html',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  reporter: isCI ? [['line'], ['html', { open: 'never' }]] : 'list',
});
