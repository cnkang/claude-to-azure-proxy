/// <reference types="vitest" />

import type { Assertion, AsymmetricMatchersContaining } from 'vitest';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
  toHaveAttribute(attribute: string, value?: string): R;
  toHaveClass(className: string): R;
  toHaveTextContent(text: string | RegExp): R;
  toHaveFocus(): R;
  toBeDisabled(): R;
  toHaveStyle(styles: Record<string, string>): R;
}

declare module 'vitest' {
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
