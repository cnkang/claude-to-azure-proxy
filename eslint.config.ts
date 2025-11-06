import type { Linter } from 'eslint';
import nodeConfig from './packages/shared-config/eslint/node';

const TS_PROJECT_PATH = ['./tsconfig.eslint.json'] as const;
const TS_CONFIG_ROOT = new URL('.', import.meta.url).pathname;

const workspaceConfig: Linter.Config[] = nodeConfig.map((config) => {
  if (!config.languageOptions) {
    return config;
  }

  const parserOptions = {
    ...(config.languageOptions.parserOptions ?? {}),
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

const rootConfig: Linter.Config[] = [
  {
    ignores: [
      'packages/shared-config/eslint/**',
      'packages/shared-config/vitest/**',
      'apps/backend/**',
    ],
  },
  ...workspaceConfig,
];

export default rootConfig satisfies Linter.Config[];
