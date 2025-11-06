import baseConfig from '../shared-config/eslint/base';
import type { Linter } from 'eslint';

const TS_PROJECT_PATH = ['./tsconfig.eslint.json'] as const;
const TS_CONFIG_ROOT = new URL('.', import.meta.url).pathname;

const configWithProject: Linter.Config[] = baseConfig.map((config) => {
  const parserOptions = {
    ...(config.languageOptions?.parserOptions ?? {}),
    project: TS_PROJECT_PATH,
    tsconfigRootDir: TS_CONFIG_ROOT,
  };

  return {
    ...config,
    languageOptions: {
      ...config.languageOptions,
      parserOptions,
    },
  };
});

export default configWithProject satisfies Linter.Config[];
