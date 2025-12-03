import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../middleware/logging';

const ABORT_ERROR_NAME = 'AbortError' as const;
const ABORT_ERROR_CODE = 'ABORT_ERR' as const;

const DEFAULT_ABORT_MESSAGE = 'Operation aborted by caller';

const ABORT_ERROR_CODES = new Set<string>(['ERR_CANCELED', ABORT_ERROR_CODE]);

const ABORT_ERROR_NAMES = new Set<string>([ABORT_ERROR_NAME]);

export const createAbortError = (reason?: unknown): Error => {
  let message = DEFAULT_ABORT_MESSAGE;
  let cause: unknown;

  if (reason instanceof Error) {
    message = reason.message?.trim().length > 0 ? reason.message : message;
    cause = reason;
  } else if (typeof reason === 'string' && reason.trim().length > 0) {
    message = reason;
  }

  const abortError = new Error(message) as Error & {
    code: string;
    cause?: unknown;
  };
  abortError.name = ABORT_ERROR_NAME;
  abortError.code = ABORT_ERROR_CODE;
  if (cause !== undefined) {
    abortError.cause = cause;
    if (cause instanceof Error && typeof cause.stack === 'string') {
      abortError.stack = cause.stack;
    }
  }
  return abortError;
};

const isAbortErrorInstance = (
  error: Error,
  seen: Set<Error>,
  depth = 0
): boolean => {
  // Prevent infinite recursion with maximum depth limit
  if (depth > 10 || seen.has(error)) {
    return false;
  }
  seen.add(error);

  if (typeof error.name === 'string' && ABORT_ERROR_NAMES.has(error.name)) {
    return true;
  }

  const errorWithCode = error as Error & { code?: string };
  if (
    typeof errorWithCode.code === 'string' &&
    ABORT_ERROR_CODES.has(errorWithCode.code)
  ) {
    return true;
  }

  const errorWithCause = error;
  if ('cause' in errorWithCause && errorWithCause.cause instanceof Error) {
    return isAbortErrorInstance(errorWithCause.cause, seen, depth + 1);
  }

  return false;
};

export const isAbortError = (error: unknown): error is Error => {
  if (!(error instanceof Error)) {
    return false;
  }

  return isAbortErrorInstance(error, new Set(), 0);
};

export const abortableDelay = async (
  ms: number,
  signal?: AbortSignal,
  reason?: unknown
): Promise<void> => {
  if (ms <= 0) {
    return;
  }

  try {
    await delay(ms, undefined, signal ? { signal } : undefined);
  } catch (error) {
    if (isAbortError(error)) {
      throw createAbortError(signal?.reason ?? reason ?? error);
    }
    throw error;
  }
};

export const throwIfAborted = (
  signal?: AbortSignal,
  reason?: unknown
): void => {
  if (!signal) {
    return;
  }

  if (signal.aborted) {
    throw createAbortError(signal.reason ?? reason);
  }
};

export const registerAbortListener = (
  signal: AbortSignal | undefined,
  onAbort: () => void
): (() => void) => {
  if (!signal) {
    return () => {};
  }

  const abortHandler = (): void => {
    try {
      onAbort();
    } catch (error) {
      logger.warn('Abort handler threw an error', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  signal.addEventListener('abort', abortHandler, { once: true });

  return () => {
    signal.removeEventListener('abort', abortHandler);
  };
};

export const waitForAbort = (
  signal: AbortSignal,
  reason?: unknown
): Promise<never> =>
  new Promise((_, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(createAbortError(signal.reason ?? reason));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
  });
