import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      'shared': resolve(__dirname, '../shared'),
      '@': resolve(__dirname, './src')
    }
  }
});