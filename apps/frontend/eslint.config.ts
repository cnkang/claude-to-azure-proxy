import { reactEslintConfig } from '@repo/shared-config';

export default [
  {
    ignores: ['src/test/**'],
  },
  ...reactEslintConfig,
];
