import net from 'node:net';
import { vi } from 'vitest';
import { setupTestEnvironment, createMockConfig } from './test-config.js';

declare global {
  var __AZURE_OPENAI_AXIOS_MOCK__:
    | {
        post: (url: string, data?: unknown, config?: unknown) => Promise<{ data: unknown }>;
      }
    | undefined;
}

vi.mock('openai', () => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const mapParams = (
    params: Record<string, unknown>
  ): Record<string, unknown> => {
    const input = params.input;

    const messages: Array<{ role: string; content: string }> =
      Array.isArray(input)
        ? input.map((entry) => {
            const candidate = entry as Record<string, unknown>;
            const role = typeof candidate.role === 'string' ? candidate.role : 'user';
            const contentValue = candidate.content;

            if (typeof contentValue === 'string') {
              return { role, content: contentValue };
            }

            if (Array.isArray(contentValue)) {
              const textContent = contentValue
                .map((block) => {
                  if (
                    typeof block === 'object' &&
                    block !== null &&
                    'text' in block &&
                    typeof (block as { text?: unknown }).text === 'string'
                  ) {
                    return (block as { text: string }).text;
                  }
                  return '';
                })
                .join('');
              return { role, content: textContent };
            }

            return { role, content: '' };
          })
        : Array.isArray((params as { messages?: unknown }).messages)
          ? ((params as { messages: Array<{ role: string; content: string }> }).messages)
          : [{ role: 'user', content: '' }];

    const payload: Record<string, unknown> = {
      model: params.model,
      messages,
    };

    if (params.temperature !== undefined) {
      payload.temperature = params.temperature;
    }

    if (params.top_p !== undefined) {
      payload.top_p = params.top_p;
    }

    if ((params as { stop?: unknown }).stop !== undefined) {
      payload.stop = (params as { stop?: unknown }).stop;
    }

    if (params.stream !== undefined) {
      payload.stream = params.stream;
    }

    if ('max_output_tokens' in params) {
      payload.max_completion_tokens = params.max_output_tokens;
      payload.max_tokens = params.max_output_tokens;
    } else if ('max_tokens' in params) {
      payload.max_completion_tokens = (params as { max_tokens?: number }).max_tokens;
      payload.max_tokens = (params as { max_tokens?: number }).max_tokens;
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );
  };

  const toResponsesResponse = (
    data: Record<string, unknown> | undefined,
    fallbackModel: unknown
  ): Record<string, unknown> => {
    if (data !== undefined && data.object === 'response') {
      return data;
    }

    let choicesCandidate: unknown;
    if (isRecord(data) && 'choices' in data) {
      choicesCandidate = data.choices;
    }
    const choices = Array.isArray(choicesCandidate) ? choicesCandidate : [];
    const output = choices.map((choice, index) => {
      let content = '';
      if (isRecord(choice) && 'message' in choice) {
        const messageCandidate = choice.message;
        if (isRecord(messageCandidate) && typeof messageCandidate.content === 'string') {
          content = messageCandidate.content;
        }
      }

      return {
        type: 'text',
        id: `msg_${index}`,
        role: 'assistant',
        content: [{ type: 'text', text: content }],
        text: content,
      };
    });

    let usageCandidate: unknown;
    if (isRecord(data) && 'usage' in data) {
      usageCandidate = data.usage;
    }
    const usage = isRecord(usageCandidate)
      ? (usageCandidate as Record<string, number | undefined>)
      : {};

    const promptTokens =
      typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const completionTokens =
      typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : 0;
    const totalTokensValue = usage.total_tokens;
    const totalTokens =
      typeof totalTokensValue === 'number'
        ? totalTokensValue
        : promptTokens + completionTokens;

    return {
      id:
        typeof data?.id === 'string'
          ? data.id
          : `resp_${Math.random().toString(36).slice(2)}`,
      object: 'response',
      created:
        typeof data?.created === 'number'
          ? data.created
          : Math.floor(Date.now() / 1000),
      model:
        typeof data?.model === 'string'
          ? data.model
          : typeof fallbackModel === 'string'
          ? fallbackModel
          : 'unknown',
      output,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        ...(usage.reasoning_tokens !== undefined
          ? { reasoning_tokens: usage.reasoning_tokens }
          : {}),
      },
    } as Record<string, unknown>;
  };

  class MockOpenAI {
    public readonly responses: {
      create: ReturnType<typeof vi.fn>;
    };

    private readonly baseURL: string;
    private readonly apiKey?: string;

    constructor(config: Record<string, unknown>) {
      this.baseURL =
        typeof config.baseURL === 'string'
          ? config.baseURL.replace(/\/$/, '')
          : '';
      this.apiKey =
        typeof config.apiKey === 'string' ? config.apiKey : undefined;

      this.responses = {
        create: vi.fn(async (params: Record<string, unknown>) => {
          const axiosMock = globalThis.__AZURE_OPENAI_AXIOS_MOCK__;
          if (axiosMock === undefined) {
            throw new Error('Azure OpenAI axios mock not configured');
          }

          const url = `${this.baseURL}/chat/completions`;
          const payload = mapParams(params);
          const headers: Record<string, string> = {};
          if (this.apiKey !== undefined) {
            headers['api-key'] = this.apiKey;
          }

          try {
            const response = await axiosMock.post(url, payload, { headers });
            return toResponsesResponse(response.data, payload.model);
          } catch (error) {
            const axiosError = error as {
              response?: { status?: number; data?: unknown };
            };

            if (axiosError.response !== undefined) {
              const payload = axiosError.response.data;
              const normalizedError =
                payload !== null &&
                typeof payload === 'object' &&
                'error' in (payload as Record<string, unknown>)
                  ? (payload as { error: unknown }).error
                  : payload;

              const errorMessage =
                normalizedError !== null &&
                typeof normalizedError === 'object' &&
                'message' in (normalizedError as Record<string, unknown>) &&
                typeof (normalizedError as { message?: unknown }).message === 'string'
                  ? ((normalizedError as { message: string }).message)
                  : 'Azure OpenAI request failed';

              const openAIError = new Error(errorMessage) as Error & {
                status?: number;
                error?: unknown;
              };
              openAIError.status = axiosError.response.status;
              openAIError.error =
                normalizedError ?? {
                  message: errorMessage,
                };
              throw openAIError;
            }

            throw error;
          }
        }),
      };
    }
  }

  return { OpenAI: MockOpenAI };
});

// Setup test environment variables
setupTestEnvironment();

// Mock the config module globally for all tests
vi.mock('../src/config/index.js', () => createMockConfig());

// Patch net.Server.listen to use localhost for tests
const originalListen = net.Server.prototype.listen.bind(net.Server.prototype);

net.Server.prototype.listen = function patchedListen(...args: unknown[]) {
  if (typeof args[0] === 'number') {
    const port = args[0];
    const hostArg = args[1];
    const hostProvided =
      typeof hostArg === 'string' ||
      (typeof hostArg === 'object' &&
        hostArg !== null &&
        'host' in (hostArg as Record<string, unknown>));

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
