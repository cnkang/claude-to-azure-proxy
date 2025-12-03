import { describe, expect, it } from 'vitest';
import type { IncomingRequest } from '../../src/types/index';
import {
  ClaudeFormatAnalyzer,
  FormatDetectionService,
  OpenAIFormatAnalyzer,
  detectRequestFormat,
  getResponseFormat,
} from '../../src/utils/format-detection';

describe('Format Detection Service', () => {
  const formatDetector = new FormatDetectionService();

  describe('Claude Format Detection', () => {
    it('should detect Claude format with content blocks', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should detect Claude format with system message', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          system: 'You are a helpful assistant',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should detect Claude format with anthropic-version', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          'anthropic-version': '2023-06-01',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should detect Claude format with Claude tools', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather information',
              input_schema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should detect Claude format with max_tokens only', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });
  });

  describe('OpenAI Format Detection', () => {
    it('should detect OpenAI format with max_completion_tokens', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          max_completion_tokens: 100,
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('openai');
    });

    it('should detect OpenAI format with OpenAI tools', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather information',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('openai');
    });

    it('should detect OpenAI format with response_format', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
          response_format: {
            type: 'json_object',
          },
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('openai');
    });

    it('should detect OpenAI format with tool role', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
            {
              role: 'tool',
              content: null,
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('openai');
    });

    it('should detect OpenAI format without messages field when strong indicators present', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          max_completion_tokens: 100,
          // No messages field
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('openai');
    });
  });

  describe('Edge Cases', () => {
    it('should default to Claude format for invalid request', () => {
      const request: IncomingRequest = {
        body: null,
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should default to Claude format for empty request', () => {
      const request: IncomingRequest = {
        body: {},
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should default to Claude format for ambiguous request', () => {
      const request: IncomingRequest = {
        body: {
          model: 'some-model',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should prioritize Claude format when both indicators are present', () => {
      const request: IncomingRequest = {
        body: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          max_completion_tokens: 100, // OpenAI indicator
          system: 'You are helpful', // Claude indicator
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = formatDetector.detectRequestFormat(request);
      expect(format).toBe('claude');
    });
  });

  describe('Response Format Mapping', () => {
    it('should return claude response format for claude request format', () => {
      const responseFormat = formatDetector.getResponseFormat('claude');
      expect(responseFormat).toBe('claude');
    });

    it('should return openai response format for openai request format', () => {
      const responseFormat = formatDetector.getResponseFormat('openai');
      expect(responseFormat).toBe('openai');
    });
  });

  describe('Utility Functions', () => {
    it('should detect request format using utility function', () => {
      const request: IncomingRequest = {
        body: {
          model: 'gpt-4',
          max_completion_tokens: 100,
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
        headers: {},
        method: 'POST',
        url: '/v1/completions',
      };

      const format = detectRequestFormat(request);
      expect(format).toBe('openai');
    });

    it('should get response format using utility function', () => {
      const responseFormat = getResponseFormat('openai');
      expect(responseFormat).toBe('openai');
    });
  });
});

describe('Claude Format Analyzer', () => {
  it('should analyze Claude format correctly', () => {
    const body = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      system: 'You are helpful',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    };

    const isClaude = ClaudeFormatAnalyzer.analyze(body);
    expect(isClaude).toBe(true);
  });

  it('should reject non-Claude format', () => {
    const body = {
      model: 'gpt-4',
      max_completion_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    };

    const isClaude = ClaudeFormatAnalyzer.analyze(body);
    expect(isClaude).toBe(false);
  });
});

describe('OpenAI Format Analyzer', () => {
  it('should analyze OpenAI format correctly', () => {
    const body = {
      model: 'gpt-4',
      max_completion_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    };

    const isOpenAI = OpenAIFormatAnalyzer.analyze(body);
    expect(isOpenAI).toBe(true);
  });

  it('should reject Claude format', () => {
    const body = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      system: 'You are helpful',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    };

    const isOpenAI = OpenAIFormatAnalyzer.analyze(body);
    expect(isOpenAI).toBe(false);
  });

  it('should require messages array', () => {
    const body = {
      model: 'gpt-4',
      max_completion_tokens: 100,
    };

    const isOpenAI = OpenAIFormatAnalyzer.analyze(body);
    expect(isOpenAI).toBe(false);
  });
});
