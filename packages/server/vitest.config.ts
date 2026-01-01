import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test-fixtures/**'],
    // Increase timeouts for CI environments (slower runners)
    testTimeout: process.env.CI ? 60000 : 30000,
    hookTimeout: process.env.CI ? 60000 : 30000,
    // Configure reporters: JUnit for CI, default for local
    reporters: process.env.CI
      ? ['default', 'junit']
      : ['default'],
    outputFile: {
      junit: './test-output/junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['test/**', 'test-fixtures/**', 'dist/**'],
    },
  },
});
