import { logger } from '../middleware/logging';

const ABORT_ERROR_NAME = 'AbortError' as const;
const ABORT_ERROR_CODE = 'ABORT_ERR' as const;

const DEFAULT_ABORT_MESSAGE = 'Operation aborted by caller';

export const createAbortError = (reason?: unknown): Error => {
  if (reason instanceof Error) {
    const abortError = reason;
    if (!abortError.name || abortError.name === 'Error') {
      abortError.name = ABORT_ERROR_NAME;
    }
    if (!(abortError as Error & { code?: string }).code) {
      (abortError as Error & { code?: string }).code = ABORT_ERROR_CODE;
    }
    return abortError;
  }

  const message =
    typeof reason === 'string' && reason.trim().length > 0
      ? reason
      : DEFAULT_ABORT_MESSAGE;

  const abortError = new Error(message);
  abortError.name = ABORT_ERROR_NAME;
  (abortError as Error & { code?: string }).code = ABORT_ERROR_CODE;
  return abortError;
};

export const isAbortError = (error: unknown): error is Error => {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    if (error.name === ABORT_ERROR_NAME) {
      return true;
    }
    if (typeof code === 'string' && code === ABORT_ERROR_CODE) {
      return true;
    }
    const message = error.message.toLowerCase();
    if (message.includes('aborted') || message.includes('abort')) {
      return true;
    }
  }

  return false;
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
