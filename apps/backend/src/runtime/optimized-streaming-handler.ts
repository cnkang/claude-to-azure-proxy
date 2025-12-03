import type { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response as ExpressResponse } from 'express';

type ImmutableResponse = Readonly<ExpressResponse>;

export class OptimizedSSEHandler {
  private readonly activeStreams = new Set<ExpressResponse>();

  public initializeSSE(res: ImmutableResponse): void {
    const response = res as ExpressResponse;

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    });

    this.activeStreams.add(response);

    response.on('close', () => {
      this.activeStreams.delete(response);
    });
  }

  public sendEvent(
    res: ImmutableResponse,
    event: string,
    data: unknown
  ): boolean {
    const response = res as ExpressResponse;

    if (!this.activeStreams.has(response) || response.destroyed) {
      return false;
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    return response.write(`event: ${event}\ndata: ${payload}\n\n`);
  }

  public endStream(res: ImmutableResponse): void {
    const response = res as ExpressResponse;

    if (!this.activeStreams.has(response)) {
      return;
    }

    response.end();
    this.activeStreams.delete(response);
  }

  public cleanup(): void {
    for (const stream of this.activeStreams) {
      stream.end();
    }
    this.activeStreams.clear();
  }

  public [Symbol.dispose](): void {
    this.cleanup();
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.cleanup();
    return Promise.resolve();
  }
}

let globalSSEHandler: OptimizedSSEHandler | undefined;

export function getOptimizedSSEHandler(): OptimizedSSEHandler {
  globalSSEHandler ??= new OptimizedSSEHandler();
  return globalSSEHandler;
}

export function cleanupGlobalSSEHandler(): void {
  if (globalSSEHandler !== undefined) {
    globalSSEHandler.cleanup();
    globalSSEHandler = undefined;
  }
}

export async function createOptimizedStreamingPipeline(
  source: Readonly<Readable>,
  destination: Readonly<Writable>,
  transforms: ReadonlyArray<Transform> = []
): Promise<void> {
  const pipelineTransforms = transforms.length > 0 ? transforms : [];
  const streams: ReadonlyArray<NodeJS.ReadableStream | NodeJS.WritableStream> =
    [source as Readable, ...pipelineTransforms, destination as Writable];

  await pipeline(streams);
}

export default OptimizedSSEHandler;
