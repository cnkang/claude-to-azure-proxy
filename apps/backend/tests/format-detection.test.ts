/**
 * Unit tests for request format detection service
 * Tests Claude vs OpenAI format detection accuracy and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  FormatDetectionService,
  ClaudeFormatAnalyzer,
  OpenAIFormatAnalyzer,
  createFormatDetectionService,
  detectRequestFormat,
  getResponseFormat,
} from '../src/utils/format-detection';
import type { IncomingRequest } from '../src/types/index';

describe('FormatDetectionService', () => {
  let service: FormatDetectionService;

  beforeEach(() => {
    service = new FormatDetectionService();
  });

  describe('detectRequestFormat', () => {
    describe('Claude format detection', () => {
      it('should detect Claude format with anthropic-version header', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            'anthropic-version': '2023-06-01',
            model: 'claude-3-sonnet-20240229',
            messages: [
              {
                role: 'user',
                content: 'Hello, world!',
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should detect Claude format with system message', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            system: 'You are a helpful assistant.',
            messages: [
              {
                role: 'user',
                content: 'Hello, world!',
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should detect Claude format with content blocks', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Hello, world!',
                  },
                ],
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should detect Claude format with tool_use content blocks', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            messages: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: 'tool_123',
                    name: 'calculator',
                    input: { expression: '2 + 2' },
                  },
                ],
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should detect Claude format with Claude tool definition', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            messages: [
              {
                role: 'user',
                content: 'Calculate 2 + 2',
              },
            ],
            tools: [
              {
                name: 'calculator',
                description: 'Perform calculations',
                input_schema: {
                  type: 'object',
                  properties: {
                    expression: { type: 'string' },
                  },
                },
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should detect Claude format with max_tokens only', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            messages: [
              {
                role: 'user',
                content: 'Hello, world!',
              },
            ],
            max_tokens: 1000,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });
    });

    describe('OpenAI format detection', () => {
      it('should detect OpenAI format with max_completion_tokens', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'gpt-4',
            messages: [
              {
                role: 'user',
                content: 'Hello, world!',
              },
            ],
            max_completion_tokens: 1000,
          },
          path: '/v1/chat/completions',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('openai');
      });

      it('should detect OpenAI format with simple message structure and indicator', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Hello, world!',
              },
              {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
            ],
            max_completion_tokens: 1000, // Add OpenAI indicator
          },
          path: '/v1/chat/completions',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('openai');
      });

      it('should detect OpenAI format with tool role', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'gpt-4',
            messages: [
              {
                role: 'user',
                content: 'Calculate 2 + 2',
              },
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'calculator',
                      arguments: '{"expression": "2 + 2"}',
                    },
                  },
                ],
              },
              {
                role: 'tool',
                content: '4',
                tool_call_id: 'call_123',
              },
            ],
          },
          path: '/v1/chat/completions',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('openai');
      });

      it('should detect OpenAI format with OpenAI tool definition', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'gpt-4',
            messages: [
              {
                role: 'user',
                content: 'Calculate 2 + 2',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'calculator',
                  description: 'Perform calculations',
                  parameters: {
                    type: 'object',
                    properties: {
                      expression: { type: 'string' },
                    },
                  },
                },
              },
            ],
          },
          path: '/v1/chat/completions',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('openai');
      });

      it('should detect OpenAI format with response_format', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'gpt-4',
            messages: [
              {
                role: 'user',
                content: 'Generate JSON data',
              },
            ],
            response_format: {
              type: 'json_object',
            },
          },
          path: '/v1/chat/completions',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('openai');
      });
    });

    describe('Edge cases and fallback logic', () => {
      it('should default to Claude format for invalid request structure', () => {
        const request: IncomingRequest = {
          headers: {},
          body: null,
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should default to Claude format for malformed request body', () => {
        const request: IncomingRequest = {
          headers: {},
          body: 'invalid json string',
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should default to Claude format for unknown request structure', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            unknown_field: 'value',
            another_field: 123,
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should default to Claude format when detection throws error', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            // Create a circular reference to cause JSON issues
            get circular() {
              return this;
            },
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });

      it('should prioritize Claude format when both indicators are present', () => {
        const request: IncomingRequest = {
          headers: {},
          body: {
            model: 'claude-3-sonnet-20240229',
            'anthropic-version': '2023-06-01', // Claude indicator
            max_completion_tokens: 1000, // OpenAI indicator
            messages: [
              {
                role: 'user',
                content: 'Hello, world!',
              },
            ],
          },
          path: '/v1/messages',
        };

        const format = service.detectRequestFormat(request);
        expect(format).toBe('claude');
      });
    });
  });

  describe('getResponseFormat', () => {
    it('should return Claude format for Claude request format', () => {
      const responseFormat = service.getResponseFormat('claude');
      expect(responseFormat).toBe('claude');
    });

    it('should return OpenAI format for OpenAI request format', () => {
      const responseFormat = service.getResponseFormat('openai');
      expect(responseFormat).toBe('openai');
    });
  });
});

describe('ClaudeFormatAnalyzer', () => {
  describe('analyze', () => {
    it('should return true for anthropic-version header', () => {
      const body = {
        'anthropic-version': '2023-06-01',
        model: 'claude-3-sonnet-20240229',
        messages: [],
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for system message', () => {
      const body = {
        model: 'claude-3-sonnet-20240229',
        system: 'You are a helpful assistant.',
        messages: [],
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for content blocks', () => {
      const body = {
        model: 'claude-3-sonnet-20240229',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
              },
            ],
          },
        ],
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for Claude tools', () => {
      const body = {
        model: 'claude-3-sonnet-20240229',
        messages: [],
        tools: [
          {
            name: 'calculator',
            description: 'Calculate',
            input_schema: { type: 'object' },
          },
        ],
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for max_tokens without max_completion_tokens', () => {
      const body = {
        model: 'claude-3-sonnet-20240229',
        messages: [],
        max_tokens: 1000,
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return false for non-object body', () => {
      const result = ClaudeFormatAnalyzer.analyze('not an object');
      expect(result).toBe(false);
    });

    it('should return false for null body', () => {
      const result = ClaudeFormatAnalyzer.analyze(null);
      expect(result).toBe(false);
    });

    it('should return false for body without Claude indicators', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      };

      const result = ClaudeFormatAnalyzer.analyze(body);
      expect(result).toBe(false);
    });
  });
});

describe('OpenAIFormatAnalyzer', () => {
  describe('analyze', () => {
    it('should return true for max_completion_tokens', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_completion_tokens: 1000,
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for simple message structure with OpenAI indicator', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
          {
            role: 'assistant',
            content: 'Hi there!',
          },
        ],
        max_completion_tokens: 1000, // Add OpenAI indicator
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for OpenAI tools', () => {
      const body = {
        model: 'gpt-4',
        messages: [],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Calculate',
              parameters: { type: 'object' },
            },
          },
        ],
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for OpenAI response format', () => {
      const body = {
        model: 'gpt-4',
        messages: [],
        response_format: {
          type: 'json_object',
        },
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return true for tool role in messages', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'tool',
            content: 'Result',
            tool_call_id: 'call_123',
          },
        ],
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(true);
    });

    it('should return false for Claude format body', () => {
      const body = {
        model: 'claude-3-sonnet-20240229',
        'anthropic-version': '2023-06-01',
        messages: [],
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(false);
    });

    it('should return false for non-object body', () => {
      const result = OpenAIFormatAnalyzer.analyze('not an object');
      expect(result).toBe(false);
    });

    it('should return false for null body', () => {
      const result = OpenAIFormatAnalyzer.analyze(null);
      expect(result).toBe(false);
    });

    it('should return false for body without messages', () => {
      const body = {
        model: 'gpt-4',
        max_completion_tokens: 1000,
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(false);
    });

    it('should return false for body without OpenAI indicators', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      };

      const result = OpenAIFormatAnalyzer.analyze(body);
      expect(result).toBe(false);
    });
  });
});

describe('Utility functions', () => {
  describe('createFormatDetectionService', () => {
    it('should create a new FormatDetectionService instance', () => {
      const service = createFormatDetectionService();
      expect(service).toBeInstanceOf(FormatDetectionService);
    });
  });

  describe('detectRequestFormat', () => {
    it('should detect Claude format correctly', () => {
      const request: IncomingRequest = {
        headers: {},
        body: {
          'anthropic-version': '2023-06-01',
          model: 'claude-3-sonnet-20240229',
          messages: [],
        },
        path: '/v1/messages',
      };

      const format = detectRequestFormat(request);
      expect(format).toBe('claude');
    });

    it('should detect OpenAI format correctly', () => {
      const request: IncomingRequest = {
        headers: {},
        body: {
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
          max_completion_tokens: 1000,
        },
        path: '/v1/chat/completions',
      };

      const format = detectRequestFormat(request);
      expect(format).toBe('openai');
    });
  });

  describe('getResponseFormat', () => {
    it('should return matching response format for Claude', () => {
      const responseFormat = getResponseFormat('claude');
      expect(responseFormat).toBe('claude');
    });

    it('should return matching response format for OpenAI', () => {
      const responseFormat = getResponseFormat('openai');
      expect(responseFormat).toBe('openai');
    });
  });
});

describe('Format-based response routing', () => {
  let service: FormatDetectionService;

  beforeEach(() => {
    service = createFormatDetectionService();
  });

  it('should route Claude request to Claude response format', () => {
    const request: IncomingRequest = {
      headers: {},
      body: {
        'anthropic-version': '2023-06-01',
        model: 'claude-3-sonnet-20240229',
        messages: [
          {
            role: 'user',
            content: 'Hello, world!',
          },
        ],
      },
      path: '/v1/messages',
    };

    const requestFormat = service.detectRequestFormat(request);
    const responseFormat = service.getResponseFormat(requestFormat);

    expect(requestFormat).toBe('claude');
    expect(responseFormat).toBe('claude');
  });

  it('should route OpenAI request to OpenAI response format', () => {
    const request: IncomingRequest = {
      headers: {},
      body: {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello, world!',
          },
        ],
        max_completion_tokens: 1000,
      },
      path: '/v1/chat/completions',
    };

    const requestFormat = service.detectRequestFormat(request);
    const responseFormat = service.getResponseFormat(requestFormat);

    expect(requestFormat).toBe('openai');
    expect(responseFormat).toBe('openai');
  });

  it('should handle mixed format scenarios with Claude priority', () => {
    const request: IncomingRequest = {
      headers: {},
      body: {
        'anthropic-version': '2023-06-01', // Claude indicator
        model: 'claude-3-sonnet-20240229',
        messages: [
          {
            role: 'user',
            content: 'Hello, world!',
          },
        ],
        max_completion_tokens: 1000, // OpenAI indicator
      },
      path: '/v1/messages',
    };

    const requestFormat = service.detectRequestFormat(request);
    const responseFormat = service.getResponseFormat(requestFormat);

    expect(requestFormat).toBe('claude');
    expect(responseFormat).toBe('claude');
  });
});
