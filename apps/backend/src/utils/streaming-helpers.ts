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
      try {
        res.write(chunk);
      } catch (writeError) {
        // Convert write errors to abort errors for consistent handling
        throw createAbortError(
          writeError instanceof Error 
            ? writeError.message 
            : 'Failed to write to response stream'
        );
      }
    },
    end: (finalChunk?: string, options?: WritableOptions): void => {
      if (finalChunk !== undefined) {
        ensureWritable(options);
        try {
          res.write(finalChunk);
        } catch (writeError) {
          throw createAbortError(
            writeError instanceof Error 
              ? writeError.message 
              : 'Failed to write final chunk to response stream'
          );
        }
      }

      if (!res.writableEnded) {
        try {
          res.end();
        } catch (endError) {
          throw createAbortError(
            endError instanceof Error 
              ? endError.message 
              : 'Failed to end response stream'
          );
        }
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
