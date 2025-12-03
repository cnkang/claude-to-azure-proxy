/**
 * I18n Integration Test
 *
 * Simple integration test to verify the i18n system is working correctly.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { describe, expect, it } from 'vitest';
import i18n from '../i18n/index';

describe('I18n Integration (happy-dom)', () => {
  it('exposes a translation function', () => {
    expect(typeof i18n.t).toBe('function');
  });

  it('renders a fallback string when key missing', () => {
    const result = i18n.t('nonexistent.key', 'fallback');
    expect(result).toBe('fallback');
  });
});
