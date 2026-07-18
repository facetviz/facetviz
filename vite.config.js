import { defineConfig } from 'vite';

// Serve from the project root so both /examples and /src are reachable.
export default defineConfig({
  root: '.',
  server: { port: 5174, open: '/examples/index.html' },
});
