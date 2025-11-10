/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import type { Response } from 'express';

import { createAbortError, registerAbortListener, throwIfAborted } from './abort-utils';

interface WritableOptions {
  readonly closedMessage?: string;
}

export interface AbortableStreamWriter {
  readonly write: (chunk: string, options?: WritableOptions) => void;
  readonly end: (finalChunk?: string, options?: WritableOptions) => void;
  readonly ensureWritable: (options?: WritableOptions) => void;
}

export const createAbortableStreamWriter = (
  res: Response,
  signal?: AbortSignal
): AbortableStreamWriter => {
  const ensureWritable = (options?: WritableOptions): void => {
    throwIfAborted(signal);
    if (res.writableEnded) {
      throw createAbortError(
        options?.closedMessage ?? 'Response stream closed by client'
      );
    }
  };

  return {
    ensureWritable,
    write: (chunk: string, options?: WritableOptions): void => {
      ensureWritable(options);
      res.write(chunk);
    },
    end: (finalChunk?: string, options?: WritableOptions): void => {
      if (finalChunk !== undefined) {
        ensureWritable(options);
        res.write(finalChunk);
      }

      if (!res.writableEnded) {
        res.end();
      }
    },
  };
};

export const endResponseOnAbort = (
  res: Response,
  signal?: AbortSignal
): (() => void) =>
  registerAbortListener(signal, () => {
    if (!res.writableEnded) {
      res.end();
    }
  });
