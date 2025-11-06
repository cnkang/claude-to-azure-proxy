import { defineConfig } from 'vitest/config';
import baseConfig from '../shared-config/vitest/base';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      thresholds: {
        global: {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
      },
    },
  },
});
