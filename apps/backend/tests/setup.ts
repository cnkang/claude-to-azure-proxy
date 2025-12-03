import _net from 'node:net';
import { vi } from 'vitest';
import {
  nodejs24TestUtils,
  setupNodeJS24TestEnvironment,
} from './nodejs24-test-config';
import { createMockConfig, setupTestEnvironment } from './test-config';

declare global {
  var __AZURE_OPENAI_AXIOS_MOCK__:
    | {
        post: (
          url: string,
          data?: unknown,
          config?: unknown
        ) => Promise<{ data: unknown }>;
      }
    | undefined;
}

vi.mock('openai', () => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const getRole = (entry: Record<string, unknown>): string =>
    typeof entry.role === 'string' ? entry.role : 'user';

  const extractTextFromContent = (contentValue: unknown): string => {
    if (typeof contentValue === 'string') {
      return contentValue;
    }

    if (Array.isArray(contentValue)) {
      return contentValue
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
    }

    return '';
  };

  const toMessageFromEntry = (entry: unknown): { role: string; content: string } => {
    if (!isRecord(entry)) {
      return { role: 'user', content: '' };
    }

    return {
      role: getRole(entry),
      content: extractTextFromContent(entry.content),
    };
  };

  const normalizeMessages = (
    params: Record<string, unknown>
  ): Array<{ role: string; content: string }> => {
    const input = params.input;

    if (Array.isArray(input)) {
      return input.map((entry) => toMessageFromEntry(entry));
    }

    if (Array.isArray((params as { messages?: unknown }).messages)) {
      return (params as { messages: Array<{ role: string; content: string }> })
        .messages;
    }

    return [{ role: 'user', content: '' }];
  };

  const mapParams = (
    params: Record<string, unknown>
  ): Record<string, unknown> => {
    const messages = normalizeMessages(params);

    const payload: Record<string, unknown> = {
      model: params.model,
      messages,
    };

    const addIfDefined = (
      key: string,
      value: unknown,
      target: Record<string, unknown>
    ): void => {
      if (value !== undefined) {
        target[key] = value;
      }
    };

    addIfDefined('temperature', params.temperature, payload);
    addIfDefined('top_p', params.top_p, payload);
    addIfDefined('stop', (params as { stop?: unknown }).stop, payload);
    addIfDefined('stream', params.stream, payload);

    if ('max_output_tokens' in params) {
      payload.max_completion_tokens = params.max_output_tokens;
      payload.max_tokens = params.max_output_tokens;
    } else if ('max_tokens' in params) {
      const maxTokens = (params as { max_tokens?: number }).max_tokens;
      addIfDefined('max_completion_tokens', maxTokens, payload);
      addIfDefined('max_tokens', maxTokens, payload);
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );
  };

  const resolveResponseId = (
    data: Record<string, unknown> | undefined
  ): string =>
    (isRecord(data) && typeof data.id === 'string' ? data.id : undefined) ??
    `resp_${Math.random().toString(36).slice(2)}`;

  const resolveCreatedAt = (data: Record<string, unknown> | undefined): number =>
    isRecord(data) &&
    typeof (data.created_at ?? data.created) === 'number' &&
    Number.isFinite(data.created_at ?? data.created)
      ? ((data.created_at ?? data.created) as number)
      : Math.floor(Date.now() / 1000);

  const resolveModelValue = (
    data: Record<string, unknown> | undefined,
    fallbackModel: unknown
  ): string =>
    isRecord(data) && typeof data.model === 'string'
      ? data.model
      : typeof fallbackModel === 'string'
        ? fallbackModel
        : 'mock-model';

  const extractChoiceText = (
    data: Record<string, unknown> | undefined,
    defaultText: string
  ): string => {
    if (!isRecord(data) || !('choices' in data) || !Array.isArray(data.choices)) {
      return defaultText;
    }

    const firstChoice = data.choices[0];
    if (
      isRecord(firstChoice) &&
      'message' in firstChoice &&
      isRecord(firstChoice.message) &&
      typeof firstChoice.message.content === 'string'
    ) {
      return firstChoice.message.content;
    }

    return '';
  };

  const extractUsage = (
    data: Record<string, unknown> | undefined,
    textContent: string
  ): { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens: number } => {
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
    const reasoningTokens =
      typeof usageCandidate?.reasoning_tokens === 'number'
        ? usageCandidate.reasoning_tokens
        : 0;

    return { promptTokens, completionTokens, totalTokens, reasoningTokens };
  };

  const toResponsesResponse = (
    data: Record<string, unknown> | undefined,
    fallbackModel: unknown,
    defaultText = 'Mock Azure OpenAI response'
  ): Record<string, unknown> => {
    if (data?.object === 'response') {
      return data;
    }

    const responseId = resolveResponseId(data);
    const createdAt = resolveCreatedAt(data);
    const model = resolveModelValue(data, fallbackModel);
    const textContent = extractChoiceText(data, defaultText);
    const usage = extractUsage(data, textContent);
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
        input_tokens: usage.promptTokens,
        output_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens_details: {
          reasoning_tokens: usage.reasoningTokens,
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
        create: vi.fn((params: Record<string, unknown>) =>
          this.handleCreateRequest(params)
        ),
        stream: vi.fn((params: Record<string, unknown>) =>
          this.createMockStream(params)
        ),
      };
    }

    private getHeaders(): Record<string, string> {
      const headers: Record<string, string> = {};
      if (this.apiKey !== undefined) {
        headers['api-key'] = this.apiKey;
      }
      return headers;
    }

    private getDefaultText(payload: Record<string, unknown>): string {
      const firstMessage =
        Array.isArray(payload.messages) && payload.messages.length > 0
          ? payload.messages[0]
          : undefined;

      return firstMessage !== undefined && typeof firstMessage.content === 'string'
        ? `Mock response to: ${firstMessage.content}`
        : 'Mock Azure OpenAI response';
    }

    private normalizeAxiosError(error: unknown): Error {
      const axiosError = error as { response?: { status?: number; data?: unknown } };

      if (axiosError.response === undefined) {
        return error as Error;
      }

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
          ? (normalizedError as { message: string }).message
          : 'Azure OpenAI request failed';

      const openAIError = new Error(errorMessage) as Error & {
        status?: number;
        error?: unknown;
      };
      openAIError.status = axiosError.response.status;
      openAIError.error = normalizedError ?? { message: errorMessage };
      return openAIError;
    }

    private async handleCreateRequest(
      params: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const axiosMock = globalThis.__AZURE_OPENAI_AXIOS_MOCK__;
      if (axiosMock === undefined) {
        throw new Error('Azure OpenAI axios mock not configured');
      }

      const url = `${this.baseURL}/chat/completions`;
      const payload = mapParams(params);
      const headers = this.getHeaders();

      try {
        const response = await axiosMock.post(url, payload, { headers });
        const defaultText = this.getDefaultText(payload);
        return toResponsesResponse(response.data, payload.model, defaultText);
      } catch (error) {
        throw this.normalizeAxiosError(error);
      }
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

      const completedResponse = this.buildCompletedResponse(response);
      const events = this.buildStreamEvents(completedResponse);

      return {
        async *[Symbol.asyncIterator]() {
          for (const event of events) {
            yield event;
          }
        },
      };
    }

    private buildCompletedResponse(
      response: Record<string, unknown>
    ): Record<string, unknown> {
      const responseId =
        typeof response.id === 'string'
          ? response.id
          : `resp_${Math.random().toString(36).slice(2)}`;
      const createdAt =
        typeof response.created_at === 'number'
          ? response.created_at
          : Math.floor(Date.now() / 1000);

      return {
        ...response,
        id: responseId,
        created_at: createdAt,
      };
    }

    private getFirstOutput(
      response: Record<string, unknown>
    ): Record<string, unknown> | undefined {
      if (!Array.isArray(response.output) || response.output.length === 0) {
        return undefined;
      }

      return response.output[0] as Record<string, unknown>;
    }

    private getContentArray(
      firstOutput: Record<string, unknown> | undefined
    ): Array<Record<string, unknown>> | undefined {
      if (
        firstOutput === undefined ||
        !('content' in firstOutput) ||
        !Array.isArray(firstOutput.content)
      ) {
        return undefined;
      }

      return firstOutput.content as Array<Record<string, unknown>>;
    }

    private getMessageContent(response: Record<string, unknown>): string {
      const firstOutput = this.getFirstOutput(response);
      const contentArray = this.getContentArray(firstOutput);
      if (contentArray === undefined || contentArray.length === 0) {
        return 'Mock streaming response';
      }

      const [firstContent] = contentArray;
      return typeof firstContent.text === 'string'
        ? firstContent.text
        : 'Mock streaming response';
    }

    private buildStreamEvents(
      completedResponse: Record<string, unknown>
    ): ReadonlyArray<Record<string, unknown>> {
      const responseId = completedResponse.id as string;
      const messageContent = this.getMessageContent(completedResponse);

      return [
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
    }
  }

  return { OpenAI: MockOpenAI };
});

// Validate Node.js 24 environment
try {
  nodejs24TestUtils.validateNodeJS24Environment();
} catch (error) {
  console.warn('Node.js 24 validation warning:', (error as Error).message);
}

// Setup test environment variables
setupTestEnvironment();

// Setup Node.js 24 specific test environment
setupNodeJS24TestEnvironment();

// Mock the config module globally for all tests
vi.mock('../src/config/index.js', () => createMockConfig());

// Patch net.Server.listen to use localhost for tests
// TEMPORARILY DISABLED - might be causing supertest issues
/*
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
*/
