/// <reference types="vitest" />
import 'vitest';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
  toHaveAttribute(attribute: string, value?: string): R;
  toHaveClass(className: string): R;
  toHaveTextContent(text: string | RegExp): R;
  toHaveFocus(): R;
  toBeDisabled(): R;
  toHaveStyle(styles: Record<string, string>): R;
  toHaveNoViolations(): R;
  toHaveAccessibleName(name?: string | RegExp): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

declare module '@vitest/expect' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
