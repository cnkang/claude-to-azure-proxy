import { describe, it, expect, vi } from 'vitest';
import {
  transformRequest,
  validateClaudeRequest,
  transformClaudeToAzureRequest,
  createAzureHeaders,
  ValidationError,
  SecurityError,
} from '../src/utils/request-transformer.js';
import {
  transformAzureResponseToClaude,
  isAzureOpenAIResponse,
  isAzureOpenAIError,
} from '../src/utils/response-transformer.js';
import { sanitizeInput } from '../src/middleware/security.js';

/**
 * Property-based testing for transformation functions
 * Tests invariants and properties that should hold for all valid inputs
 */

describe('Property-Based Tests', () => {
  describe('Request Transformation Properties', () => {
    it('should preserve essential data through transformation', () => {
      // Property: Essential request data should be preserved
      const testCases = [
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Hello, world!',
          max_tokens: 100,
        },
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test with temperature',
          max_tokens: 50,
          temperature: 0.7,
        },
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test with all parameters',
          max_tokens: 200,
          temperature: 0.5,
          top_p: 0.9,
          stop_sequences: ['END', 'STOP'],
        },
      ];

      testCases.forEach((claudeRequest) => {
        const azureModel = 'gpt-5-codex';
        const azureRequest = transformClaudeToAzureRequest(
          claudeRequest,
          azureModel
        );

        // Property: Model should be mapped to Azure model
        expect(azureRequest.model).toBe(azureModel);

        // Property: Prompt should be preserved in messages
        expect(azureRequest.messages).toHaveLength(1);
        expect(azureRequest.messages[0].content).toBe(claudeRequest.prompt);
        expect(azureRequest.messages[0].role).toBe('user');

        // Property: max_tokens should be preserved
        expect(azureRequest.max_tokens).toBe(claudeRequest.max_tokens);

        // Property: Optional parameters should be preserved if present
        if (claudeRequest.temperature !== undefined) {
          expect(azureRequest.temperature).toBe(claudeRequest.temperature);
        }
        if (claudeRequest.top_p !== undefined) {
          expect(azureRequest.top_p).toBe(claudeRequest.top_p);
        }
        if (claudeRequest.stop_sequences) {
          expect(azureRequest.stop).toEqual(claudeRequest.stop_sequences);
        }
      });
    });

    it('should always generate valid headers', () => {
      // Property: Headers should always be valid and complete
      const apiKeys = [
        'a'.repeat(32),
        'b'.repeat(64),
        'test-api-key-1234567890123456789012',
      ];

      apiKeys.forEach((apiKey) => {
        const headers = createAzureHeaders(apiKey);

        // Property: All required headers should be present
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers['api-key']).toBe(apiKey);
        expect(headers['User-Agent']).toBe('claude-to-azure-proxy/1.0.0');
        expect(headers['X-Request-ID']).toBeDefined();

        // Property: Request ID should be valid UUID v4
        expect(headers['X-Request-ID']).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
      });
    });

    it('should validate input boundaries consistently', () => {
      // Property: Validation should be consistent for boundary values
      const boundaryTests = [
        // max_tokens boundaries
        {
          field: 'max_tokens',
          validValues: [1, 100, 131072],
          invalidValues: [0, -1, 131073],
        },
        // temperature boundaries
        {
          field: 'temperature',
          validValues: [0, 1, 2],
          invalidValues: [-0.1, 2.1, 3],
        },
        // top_p boundaries
        {
          field: 'top_p',
          validValues: [0, 0.5, 1],
          invalidValues: [-0.1, 1.1, 2],
        },
      ];

      boundaryTests.forEach(({ field, validValues, invalidValues }) => {
        const baseRequest = {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test prompt',
          max_tokens: 100,
        };

        validValues.forEach((value) => {
          const request = { ...baseRequest, [field]: value };
          expect(() => validateClaudeRequest(request)).not.toThrow();
        });

        invalidValues.forEach((value) => {
          const request = { ...baseRequest, [field]: value };
          expect(() => validateClaudeRequest(request)).toThrow(ValidationError);
        });
      });
    });

    it('should handle Unicode and special characters consistently', () => {
      // Property: Unicode handling should be consistent
      const unicodePrompts = [
        'Hello 世界',
        'Emoji test 🌍🚀💻',
        'Accented characters: café, naïve, résumé',
        'Mathematical symbols: ∑∫∆√π',
        'Mixed: Hello 世界 with emoji 🌍 and math ∑',
      ];

      unicodePrompts.forEach((prompt) => {
        const request = {
          model: 'claude-3-5-sonnet-20241022',
          prompt,
          max_tokens: 100,
        };

        const validatedRequest = validateClaudeRequest(request);
        expect(validatedRequest.prompt).toBe(prompt);

        const azureRequest = transformClaudeToAzureRequest(
          validatedRequest,
          'gpt-4'
        );
        expect(azureRequest.messages[0].content).toBe(prompt);
      });
    });

    it('should reject malicious input consistently', () => {
      // Property: Security validation should consistently reject malicious patterns
      const maliciousPatterns = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '{{user.password}}',
        '<img src=x onerror=alert(1)>',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      ];

      maliciousPatterns.forEach((maliciousPrompt) => {
        const request = {
          model: 'claude-3-5-sonnet-20241022',
          prompt: maliciousPrompt,
          max_tokens: 100,
        };

        expect(() => validateClaudeRequest(request)).toThrow(SecurityError);
      });
    });
  });

  describe('Response Transformation Properties', () => {
    it('should preserve response structure invariants', () => {
      // Property: Response transformation should preserve essential structure
      const azureResponses = [
        {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
            },
          ],
        },
        {
          id: 'chatcmpl-456',
          object: 'chat.completion',
          created: 1640995300,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Longer response with more content.',
              },
              finish_reason: 'length',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      ];

      azureResponses.forEach((azureResponse) => {
        const result = transformAzureResponseToClaude(
          azureResponse,
          200,
          'test-correlation-id'
        );

        // Property: Should always return valid transformation result
        expect(result).toHaveProperty('claudeResponse');
        expect(result).toHaveProperty('statusCode');
        expect(result).toHaveProperty('headers');

        // Property: Claude response should have required fields
        const claudeResponse = result.claudeResponse as any;
        expect(claudeResponse.id).toBe(azureResponse.id);
        expect(claudeResponse.type).toBe('completion');
        expect(claudeResponse.completion).toBe(
          azureResponse.choices[0].message.content
        );
        expect(claudeResponse.model).toBe('claude-3-5-sonnet-20241022');

        // Property: Headers should be valid
        expect(result.headers['Content-Type']).toBe('application/json');
        expect(result.headers['X-Correlation-ID']).toBe('test-correlation-id');
      });
    });

    it('should handle error responses consistently', () => {
      // Property: Error transformation should be consistent
      const azureErrors = [
        {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            code: 'invalid_parameter',
          },
        },
        {
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        },
        {
          error: {
            message: 'Authentication failed',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        },
      ];

      azureErrors.forEach((azureError) => {
        const result = transformAzureResponseToClaude(
          azureError,
          400,
          'test-correlation-id'
        );

        // Property: Error responses should have consistent structure
        const claudeError = result.claudeResponse as any;
        expect(claudeError.type).toBe('error');
        expect(claudeError.error.type).toBe(azureError.error.type);
        expect(claudeError.error.message).toBeDefined();
      });
    });

    it('should validate type guards consistently', () => {
      // Property: Type guards should be consistent and accurate
      const validResponses = [
        {
          id: 'test',
          object: 'chat.completion',
          created: 123,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'test' },
              finish_reason: 'stop',
            },
          ],
        },
      ];

      const invalidResponses = [
        null,
        undefined,
        'string',
        123,
        {},
        { id: 'test' },
        { id: 'test', object: 'wrong' },
        { id: 'test', object: 'chat.completion', choices: [] },
      ];

      validResponses.forEach((response) => {
        expect(isAzureOpenAIResponse(response)).toBe(true);
      });

      invalidResponses.forEach((response) => {
        expect(isAzureOpenAIResponse(response)).toBe(false);
      });

      const validErrors = [{ error: { message: 'test', type: 'error' } }];

      const invalidErrors = [
        null,
        { error: 'string' },
        { error: {} },
        { error: { message: 'test' } },
      ];

      validErrors.forEach((error) => {
        expect(isAzureOpenAIError(error)).toBe(true);
      });

      invalidErrors.forEach((error) => {
        expect(isAzureOpenAIError(error)).toBe(false);
      });
    });
  });

  describe('Input Sanitization Properties', () => {
    it('should preserve safe content while removing dangerous patterns', () => {
      // Property: Safe content should be preserved, dangerous content removed
      const testCases = [
        {
          input: 'Safe content with numbers 123 and symbols !@#',
          expectPreserved: ['Safe content', 'numbers 123', 'symbols !@#'],
        },
        {
          input: 'Mixed <script>alert(1)</script> safe content',
          expectPreserved: ['Mixed', 'safe content'],
          expectRemoved: ['<script>', 'alert(1)'],
        },
      ];

      testCases.forEach(({ input, expectPreserved, expectRemoved }) => {
        const sanitized = sanitizeInput(input);

        expectPreserved?.forEach((preserved) => {
          expect(sanitized).toContain(preserved);
        });

        expectRemoved?.forEach((removed) => {
          expect(sanitized).not.toContain(removed);
        });
      });
    });

    it('should handle nested objects consistently', () => {
      // Property: Nested object sanitization should be consistent
      const testObject = {
        level1: {
          level2: {
            dangerous: '<script>alert("nested")</script>',
            safe: 'This is safe content',
          },
        },
      };

      const sanitized = sanitizeInput(testObject) as any;
      expect(sanitized.level1.level2.safe).toBe('This is safe content');
      expect(sanitized.level1.level2.dangerous).not.toContain('<script>');
    });

    it('should preserve data types for non-string inputs', () => {
      // Property: Non-string data types should be preserved
      const inputs = [
        123,
        true,
        false,
        null,
        undefined,
        [1, 2, 3],
        { number: 42, boolean: true },
      ];

      inputs.forEach((input) => {
        const result = sanitizeInput(input);
        if (typeof input === 'object' && input !== null) {
          expect(typeof result).toBe('object');
        } else {
          expect(result).toBe(input);
        }
      });
    });
  });

  describe('Error Handling Properties', () => {
    it('should handle malformed requests gracefully', () => {
      // Property: Malformed requests should be handled gracefully
      const malformedRequests = [
        null,
        undefined,
        'string instead of object',
        123,
        [],
        { model: null },
        { prompt: null },
        { max_tokens: 'not a number' },
      ];

      malformedRequests.forEach((request) => {
        try {
          validateClaudeRequest(request as any);
          // If no error thrown, that's also acceptable for some cases
        } catch (error) {
          // Should throw ValidationError, not crash
          expect(error).toBeInstanceOf(ValidationError);
        }
      });
    });

    it('should handle edge cases gracefully', () => {
      // Property: Edge cases should not cause crashes
      const edgeCases = [
        { model: '', prompt: '', max_tokens: 0 },
        { model: 'a'.repeat(1000), prompt: 'b'.repeat(10000), max_tokens: -1 },
      ];

      edgeCases.forEach((request) => {
        try {
          validateClaudeRequest(request);
          // If validation passes, transformation should also work
          transformClaudeToAzureRequest(request, 'gpt-4');
        } catch (error) {
          // Should throw ValidationError, not crash
          expect(error).toBeInstanceOf(ValidationError);
        }
      });
    });

    it('should maintain consistency under concurrent access', () => {
      // Property: Functions should be thread-safe and consistent
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Test concurrent access',
        max_tokens: 100,
      };

      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => {
          const validated = validateClaudeRequest(request);
          return transformClaudeToAzureRequest(validated, 'gpt-4');
        })
      );

      return Promise.all(promises).then((results) => {
        // All results should be identical
        const first = results[0];
        results.forEach((result) => {
          expect(result.model).toBe(first.model);
          expect(result.messages[0].content).toBe(first.messages[0].content);
          expect(result.max_tokens).toBe(first.max_tokens);
        });
      });
    });
  });

  describe('Performance Properties', () => {
    it('should handle large inputs efficiently', () => {
      // Property: Performance should degrade gracefully with input size
      const sizes = [100, 1000, 10000];

      sizes.forEach((size) => {
        const largePrompt = 'x'.repeat(size);
        const request = {
          model: 'claude-3-5-sonnet-20241022',
          prompt: largePrompt,
          max_tokens: 100,
        };

        const startTime = Date.now();
        const validated = validateClaudeRequest(request);
        const transformed = transformClaudeToAzureRequest(validated, 'gpt-4');
        const endTime = Date.now();

        // Should complete within reasonable time (adjust threshold as needed)
        expect(endTime - startTime).toBeLessThan(1000);
        expect(transformed.messages[0].content).toBe(largePrompt);
      });
    });

    it('should handle repeated operations efficiently', () => {
      // Property: Repeated operations should not degrade performance
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Repeated operation test',
        max_tokens: 100,
      };

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const validated = validateClaudeRequest(request);
        transformClaudeToAzureRequest(validated, 'gpt-4');
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      // Average time per operation should be reasonable
      expect(avgTime).toBeLessThan(10); // 10ms per operation
    });
  });

  describe('Invariant Properties', () => {
    it('should maintain request-response correlation', () => {
      // Property: Request and response should maintain correlation
      const requests = [
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test 1',
          max_tokens: 50,
        },
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test 2',
          max_tokens: 100,
        },
        {
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test 3',
          max_tokens: 150,
        },
      ];

      requests.forEach((claudeRequest, index) => {
        const azureRequest = transformClaudeToAzureRequest(
          claudeRequest,
          'gpt-4'
        );

        // Mock Azure response
        const azureResponse = {
          id: `test-${index}`,
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: `Response ${index}` },
              finish_reason: 'stop',
            },
          ],
        };

        const result = transformAzureResponseToClaude(
          azureResponse,
          200,
          `correlation-${index}`
        );

        // Verify correlation is maintained
        expect(result.claudeResponse.id).toBe(`test-${index}`);
        expect(result.headers['X-Correlation-ID']).toBe(`correlation-${index}`);
      });
    });

    it('should preserve essential data through round-trip', () => {
      // Property: Essential data should survive request -> Azure -> Claude transformation
      const originalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Round trip test',
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
      };

      const azureRequest = transformClaudeToAzureRequest(
        originalRequest,
        'gpt-4'
      );

      // Verify transformation preserved essential data
      expect(azureRequest.messages[0].content).toBe(originalRequest.prompt);
      expect(azureRequest.max_tokens).toBe(originalRequest.max_tokens);
      expect(azureRequest.temperature).toBe(originalRequest.temperature);
      expect(azureRequest.top_p).toBe(originalRequest.top_p);
    });
  });
});

/**
 * Helper function to generate test data with specific properties
 */
function generateTestRequest(overrides: any = {}) {
  return {
    model: 'claude-3-5-sonnet-20241022',
    prompt: 'Test prompt',
    max_tokens: 100,
    ...overrides,
  };
}

/**
 * Helper function to generate Azure response with specific properties
 */
function generateAzureResponse(overrides: any = {}) {
  return {
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Test response' },
        finish_reason: 'stop',
      },
    ],
    ...overrides,
  };
}
