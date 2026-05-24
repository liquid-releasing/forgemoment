import { defineConfig } from 'vitest/config';

// vite.config.js sets `root: 'src-playground'` for dev mode so the
// component playground is the active workspace. Vitest inherits that
// root by default, which moves tests away from src/ and test/. Override
// it here so the test runner sees the package root.
export default defineConfig({
  root: '.',
  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'src/**/*.test.js'],
    globals: false,
  },
});
