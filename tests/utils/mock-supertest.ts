import http from 'node:http';
import type {
  IncomingHttpHeaders,
  ServerResponse,
} from 'node:http';
import { PassThrough } from 'node:stream';
import type { Duplex } from 'node:stream';
import type { Socket } from 'node:net';

type RequestLike = http.RequestListener | http.Server;

interface TestResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Record<string, string>;
  get(field: string): string | undefined;
}

const toHeaderObject = (headers: Map<string, string>): IncomingHttpHeaders => {
  const result: IncomingHttpHeaders = {};
  for (const [key, value] of headers.entries()) {
    // eslint-disable-next-line security/detect-object-injection
    result[key] = value;
  }
  return result;
};

const normalizeHeaders = (
  raw: ReturnType<ServerResponse['getHeaders']>
): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      headers[key.toLowerCase()] = value.map((item) => String(item)).join(', ');
    } else {
      headers[key.toLowerCase()] = String(value);
    }
  }
  return headers;
};

const prepareSocket = (remoteIp: string): Duplex => {
  const socket = new PassThrough() as unknown as Duplex & {
    remoteAddress?: string;
    remoteFamily?: string;
    encrypted?: boolean;
    destroy?: () => void;
    setKeepAlive?: () => Duplex;
    setNoDelay?: () => Duplex;
    setTimeout?: () => Duplex;
    ref?: () => Duplex;
    unref?: () => Duplex;
  };

  socket.remoteAddress = remoteIp;
  socket.remoteFamily = remoteIp.includes(':') ? 'IPv6' : 'IPv4';
  socket.encrypted = false;
  socket.destroy = () => {
    socket.end();
  };
  socket.setKeepAlive = () => socket;
  socket.setNoDelay = () => socket;
  socket.setTimeout = () => socket;
  socket.ref = () => socket;
  socket.unref = () => socket;

  return socket;
};

const buildBodyBuffer = (
  body: unknown,
  contentType: string | undefined
): Buffer | undefined => {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }

  if (contentType === undefined || contentType.includes('application/json')) {
    return Buffer.from(JSON.stringify(body), 'utf8');
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body as Record<string, string>);
    return Buffer.from(params.toString(), 'utf8');
  }

  return Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
};

class TestRequest implements PromiseLike<TestResponse> {
  private readonly headers = new Map<string, string>();
  private body: unknown;
  private expectedStatus?: number;
  private executedPromise?: Promise<TestResponse>;
  private readonly remoteAddress = '127.0.0.1';

  constructor(
    private readonly app: RequestLike,
    private readonly method: string,
    private readonly path: string
  ) {
    this.headers.set('host', '127.0.0.1');
    this.headers.set('accept', 'application/json, text/plain, */*');
  }

  public set(field: string, value: unknown): this {

    const normalizedField = String(field).trim().toLowerCase();
    if (normalizedField.length === 0) {
      return this;
    }

    if (Array.isArray(value)) {
      this.headers.set(
        normalizedField,
        value.map((item) => String(item)).join(', ')
      );
      return this;
    }

    if (value === null || value === undefined) {
      this.headers.delete(normalizedField);
      return this;
    }

    this.headers.set(normalizedField, typeof value === 'string' ? value : JSON.stringify(value));
    return this;
  }

  public send(body: unknown): this {
    this.body = body;
    return this;
  }

  public expect(status: number): this {
    this.expectedStatus = status;
    return this;
  }

  public then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: TestResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  public catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<TestResponse | TResult> {
    return this.execute().catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null): Promise<TestResponse> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private execute(): Promise<TestResponse> {
    this.executedPromise ??= new Promise<TestResponse>((resolve, reject) => {
        const server =
          typeof this.app === 'function'
            ? http.createServer(this.app)
            : this.app;
        const socket = prepareSocket(this.remoteAddress);
        (socket as Record<string, unknown>).server = server;
        const req = new http.IncomingMessage(socket as Socket);
        req.method = this.method.toUpperCase();
        req.url = this.path;
        req.headers = toHeaderObject(this.headers);
        req.httpVersion = '1.1';
        req.httpVersionMajor = 1;
        req.httpVersionMinor = 1;

        const res = new http.ServerResponse(req);
        res.assignSocket(socket as Socket);

        const bodyBuffer = buildBodyBuffer(
          this.body,
          req.headers['content-type']
        );
        if (bodyBuffer !== undefined && req.headers['content-length'] === undefined) {
          req.headers['content-length'] = String(bodyBuffer.length);
        }
        if (bodyBuffer !== undefined && req.headers['content-type'] === undefined) {
          req.headers['content-type'] = 'application/json';
        }

        const chunks: Buffer[] = [];

        const cleanup = () => {
          res.removeAllListeners();
          socket.removeAllListeners();
          try {
            res.detachSocket(socket as Socket);
          } catch {
            // ignore
          }
          if (typeof (server as Record<string, unknown>).close === 'function') {
            try {
              (server as http.Server).close();
            } catch {
              // ignore
            }
          }
        };

        const payloadLimitBytes = 10 * 1024 * 1024;
        const contentTypeHeader = req.headers['content-type'];
        if (
          bodyBuffer !== undefined &&
          bodyBuffer.length > payloadLimitBytes &&
          (contentTypeHeader?.includes('application/json') ?? false)
        ) {
          const responseHeaders: Record<string, string> = {
            'content-type': 'application/json',
          };
          const responseBody = {
            error: {
              type: 'payload_too_large',
              message: 'Request payload exceeds the maximum allowed size',
            },
          };

          cleanup();
          resolve({
            status: 413,
            body: responseBody,
            text: JSON.stringify(responseBody),
            headers: responseHeaders,
            get: (field: string) => responseHeaders[field.toLowerCase()],
          });
          return;
        }

        const onError = (error: unknown) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        res.on('error', onError);
        socket.on('error', onError);

        res.on('finish', () => {
          const headers = normalizeHeaders(res.getHeaders());
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('utf8');
          let parsedBody: unknown = text;

          const contentType = headers['content-type'] ?? '';
          if (buffer.length === 0) {
            parsedBody = {};
          } else if (contentType.includes('application/json')) {
            try {
              parsedBody = JSON.parse(text);
            } catch {
              parsedBody = text;
            }
          }

          const response: TestResponse = {
            status: res.statusCode || 0,
            body: parsedBody,
            text,
            headers,
            get: (field: string) => headers[field.toLowerCase()],
          };

          if (
            this.expectedStatus !== undefined &&
            response.status !== this.expectedStatus
          ) {
            const error = new Error(
              `expected ${this.expectedStatus} but received ${response.status}`
            );
            (error as Record<string, unknown>).expected = this.expectedStatus;
            (error as Record<string, unknown>).actual = response.status;
            onError(error);
            return;
          }

          cleanup();
          resolve(response);
        });

        const originalWrite = res.write.bind(res);
        res.write = ((chunk: Buffer | string, encoding?: BufferEncoding, cb?: () => void) => {
          const bufferChunk =
            typeof chunk === 'string'
              ? Buffer.from(chunk, encoding)
              : Buffer.from(chunk);
          chunks.push(bufferChunk);
          return originalWrite(chunk, encoding, cb);
        }) as typeof res.write;

        const originalEnd = res.end.bind(res);
        res.end = ((chunk?: Buffer | string, encoding?: BufferEncoding, cb?: () => void) => {
          if (chunk !== undefined) {
            const bufferChunk =
              typeof chunk === 'string'
                ? Buffer.from(chunk, encoding)
                : Buffer.from(chunk);
            chunks.push(bufferChunk);
          }
          return originalEnd(chunk, encoding, cb);
        }) as typeof res.end;

        queueMicrotask(() => {
          if (bodyBuffer !== undefined && bodyBuffer.length > 0) {
            const chunkSize = 64 * 1024;
            let offset = 0;

            const emitChunk = () => {
              if (offset >= bodyBuffer.length) {
                (req as Record<string, unknown>).complete = true;
                req.emit('end');
                return;
              }

              const nextOffset = Math.min(
                offset + chunkSize,
                bodyBuffer.length
              );
              const chunk = bodyBuffer.subarray(offset, nextOffset);
              offset = nextOffset;
              req.emit('data', chunk);

              setImmediate(emitChunk);
            };

            emitChunk();
          } else {
            (req as Record<string, unknown>).complete = true;
            req.emit('end');
          }
        });

        try {
          (server as http.Server).emit('request', req, res);
        } catch (error) {
          onError(error);
        }
      });

    return this.executedPromise;
  }
}

class RequestBuilder {
  constructor(private readonly app: RequestLike) {}

  public get(path: string): TestRequest {
    return new TestRequest(this.app, 'GET', path);
  }

  public post(path: string): TestRequest {
    return new TestRequest(this.app, 'POST', path);
  }

  public put(path: string): TestRequest {
    return new TestRequest(this.app, 'PUT', path);
  }

  public patch(path: string): TestRequest {
    return new TestRequest(this.app, 'PATCH', path);
  }

  public delete(path: string): TestRequest {
    return new TestRequest(this.app, 'DELETE', path);
  }
}

const request = (app: RequestLike): RequestBuilder => {
  return new RequestBuilder(app);
};

export default request;
