/**
 * Analytics utility helpers
 *
 * Provides safe wrappers around Google Analytics global functions so calls
 * can be made without tripping strict TypeScript checks when analytics is
 * not available (e.g. during development or tests).
 */

type AnalyticsFunction = (...args: unknown[]) => void;

interface AnalyticsWindow extends Window {
  gtag?: AnalyticsFunction;
}

const getAnalyticsFunction = (): AnalyticsFunction | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const analyticsWindow = window as AnalyticsWindow;
  return typeof analyticsWindow.gtag === 'function'
    ? analyticsWindow.gtag
    : undefined;
};

export type AnalyticsEventPayload = Record<string, unknown>;

export const sendAnalyticsEvent = (
  eventName: string,
  payload: AnalyticsEventPayload = {}
): void => {
  const analyticsFn = getAnalyticsFunction();
  if (!analyticsFn) {
    return;
  }

  analyticsFn('event', eventName, payload);
};

export interface AnalyticsExceptionPayload extends AnalyticsEventPayload {
  description: string;
  fatal?: boolean;
}

export const reportAnalyticsException = (
  payload: AnalyticsExceptionPayload
): void => {
  sendAnalyticsEvent('exception', payload);
};
