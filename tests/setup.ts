import net from 'node:net';

const originalListen = net.Server.prototype.listen;

net.Server.prototype.listen = function patchedListen(...args: unknown[]) {
  if (typeof args[0] === 'number') {
    const port = args[0] as number;
    const hostArg = args[1];
    const hostProvided = typeof hostArg === 'string' ||
      (typeof hostArg === 'object' && hostArg !== null && 'host' in (hostArg as Record<string, unknown>));

    if (!hostProvided) {
      let callback: (() => void) | undefined;
      if (typeof args[1] === 'function') {
        callback = args[1] as () => void;
      } else if (typeof args[2] === 'function') {
        callback = args[2] as () => void;
      }

      const backlog = typeof args[1] === 'number' ? args[1] : undefined;
      const options: net.ListenOptions = { port, host: '127.0.0.1' };

      if (typeof backlog === 'number') {
        options.backlog = backlog;
      }

      return originalListen.call(this, options, callback);
    }
  }

  return originalListen.apply(this, args as Parameters<net.Server['listen']>);
};
