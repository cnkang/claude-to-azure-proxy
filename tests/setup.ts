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
    fallbackModel: unknown,
    defaultText = 'Mock Azure OpenAI response'
  ): Record<string, unknown> => {
    if (data !== undefined && data.object === 'response') {
      return data;
    }

    const responseId =
      (isRecord(data) && typeof data.id === 'string'
        ? data.id
        : undefined) ?? `resp_${Math.random().toString(36).slice(2)}`;

    const createdAt =
      (isRecord(data) &&
        typeof (data.created_at ?? data.created) === 'number' &&
        Number.isFinite(data.created_at ?? data.created)
        ? (data.created_at ?? data.created) as number
        : Math.floor(Date.now() / 1000));

    const model =
      (isRecord(data) && typeof data.model === 'string'
        ? data.model
        : typeof fallbackModel === 'string'
        ? fallbackModel
        : 'mock-model');

    let textContent = defaultText;
    if (isRecord(data) && 'choices' in data && Array.isArray(data.choices)) {
      const firstChoice = data.choices[0];
      textContent = '';
      if (
        isRecord(firstChoice) &&
        'message' in firstChoice &&
        isRecord(firstChoice.message) &&
        typeof firstChoice.message.content === 'string'
      ) {
        textContent = firstChoice.message.content;
      }
    }

    const usageCandidate = (() => {
      if (!isRecord(data)) {
        return undefined;
      }
      const candidateUsage = (data as { usage?: unknown }).usage;
      return isRecord(candidateUsage) ? candidateUsage : undefined;
    })();

    const promptTokens =
      typeof usageCandidate?.prompt_tokens === 'number'
        ? usageCandidate.prompt_tokens
        : 0;
    const completionTokens =
      typeof usageCandidate?.completion_tokens === 'number'
        ? usageCandidate.completion_tokens
        : Math.max(1, Math.ceil(textContent.length / 4));
    const totalTokens =
      typeof usageCandidate?.total_tokens === 'number'
        ? usageCandidate.total_tokens
        : promptTokens + completionTokens;
    return {
      id: responseId,
      object: 'response',
      created_at: createdAt,
      model,
      output: [
        {
          type: 'message',
          id: `${responseId}_msg_0`,
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: textContent,
              annotations: [],
            },
          ],
        },
      ],
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: totalTokens,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens_details: {
          reasoning_tokens:
            typeof usageCandidate?.reasoning_tokens === 'number'
              ? usageCandidate.reasoning_tokens
              : 0,
        },
      },
    } as Record<string, unknown>;
  };

  class MockOpenAI {
    public readonly responses: {
      create: ReturnType<typeof vi.fn>;
      stream: ReturnType<typeof vi.fn>;
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
            const firstMessage =
              Array.isArray(payload.messages) && payload.messages.length > 0
                ? payload.messages[0]
                : undefined;
            const defaultText =
              firstMessage !== undefined && typeof firstMessage.content === 'string'
                ? `Mock response to: ${firstMessage.content}`
                : 'Mock Azure OpenAI response';
            return toResponsesResponse(response.data, payload.model, defaultText);
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
        stream: vi.fn((params: Record<string, unknown>) =>
          this.createMockStream(params)
        ),
      };
    }

    private createMockStream(
      params: Record<string, unknown>
    ): AsyncIterable<Record<string, unknown>> {
      const model =
        typeof params.model === 'string' ? params.model : 'mock-model';

      const response = toResponsesResponse(
        undefined,
        model,
        'Mock streaming response'
      );

      const responseId =
        typeof response.id === 'string'
          ? response.id
          : `resp_${Math.random().toString(36).slice(2)}`;
      const createdAt =
        typeof response.created_at === 'number'
          ? response.created_at
          : Math.floor(Date.now() / 1000);

      const firstOutput =
        Array.isArray(response.output) && response.output.length > 0
          ? (response.output[0] as Record<string, unknown>)
          : undefined;
      const contentArray =
        firstOutput !== undefined &&
        'content' in firstOutput &&
        Array.isArray(firstOutput.content)
          ? (firstOutput.content as Array<Record<string, unknown>>)
          : undefined;
      const firstContent =
        contentArray !== undefined && contentArray.length > 0
          ? contentArray[0]
          : undefined;
      const messageContent =
        firstContent !== undefined &&
        typeof firstContent.text === 'string'
          ? firstContent.text
          : 'Mock streaming response';

      const completedResponse = {
        ...response,
        id: responseId,
        created_at: createdAt,
      };

      const events: ReadonlyArray<Record<string, unknown>> = [
        {
          type: 'response.created',
          sequence_number: 0,
          response: {
            ...completedResponse,
            output: [],
          },
        },
        {
          type: 'response.output_text.delta',
          sequence_number: 1,
          item_id: `${responseId}_msg_0`,
          output_index: 0,
          content_index: 0,
          delta: messageContent,
          logprobs: [],
        },
        {
          type: 'response.completed',
          sequence_number: 2,
          response: completedResponse,
        },
      ];

      return {
        async *[Symbol.asyncIterator]() {
          for (const event of events) {
            yield event;
          }
        },
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
