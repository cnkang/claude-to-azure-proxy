import { describe, it, expect } from 'vitest';
import {
  validateClaudeRequest,
  transformClaudeToAzureRequest,
  type ClaudeChatCompletionRequest,
  type ClaudeCompletionRequest,
} from '../src/utils/request-transformer.js';

describe('Chat Completions Support', () => {
  describe('validateClaudeRequest - Chat Format', () => {
    it('should validate a correct chat completion request', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      expect(result).toEqual(chatRequest);
      expect('messages' in result).toBe(true);
    });

    it('should validate multi-message conversations', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there! How can I help you?' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      expect(result).toEqual(chatRequest);
      expect('messages' in result && result.messages).toHaveLength(4);
    });

    it('should reject requests with both prompt and messages', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        'Request must have either "prompt" or "messages" field, but not both'
      );
    });

    it('should reject requests with empty messages array', () => {
      const chatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(chatRequest)).toThrow();
    });

    it('should reject messages with invalid roles', () => {
      const chatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'invalid', content: 'Hello' }],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(chatRequest)).toThrow();
    });

    it('should sanitize message content', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello\x00\x01world!' }],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      expect('messages' in result && result.messages[0].content).toBe(
        'Helloworld!'
      );
    });
  });

  describe('transformClaudeToAzureRequest - Chat Format', () => {
    it('should transform chat completion request to Azure format', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        max_tokens: 100,
        temperature: 0.7,
      };

      const result = transformClaudeToAzureRequest(chatRequest, 'gpt-4');

      expect(result.model).toBe('gpt-4');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello, world!',
      });
      expect(result.max_completion_tokens).toBe(100);
      expect(result.temperature).toBe(0.7);
      expect(result.user).toBeDefined();
    });

    it('should preserve all message roles and content', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'How are you?' },
        ],
        max_tokens: 100,
      };

      const result = transformClaudeToAzureRequest(chatRequest, 'gpt-4');

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful.',
      });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(result.messages[2]).toEqual({ role: 'assistant', content: 'Hi!' });
      expect(result.messages[3]).toEqual({
        role: 'user',
        content: 'How are you?',
      });
    });

    it('should handle optional parameters in chat format', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.8,
        top_p: 0.9,
        stop_sequences: ['END'],
        stream: true,
      };

      const result = transformClaudeToAzureRequest(chatRequest, 'gpt-4');

      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.9);
      expect(result.stop).toEqual(['END']);
      expect(result.stream).toBe(true);
    });
  });

  describe('Legacy vs Chat Format Compatibility', () => {
    it('should transform legacy prompt format correctly', () => {
      const legacyRequest: ClaudeCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello, world!',
        max_tokens: 100,
      };

      const result = transformClaudeToAzureRequest(legacyRequest, 'gpt-4');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello, world!',
      });
    });

    it('should produce equivalent Azure requests for same content', () => {
      const legacyRequest: ClaudeCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'What is AI?',
        max_tokens: 100,
        temperature: 0.7,
      };

      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'What is AI?' }],
        max_tokens: 100,
        temperature: 0.7,
      };

      const legacyResult = transformClaudeToAzureRequest(
        legacyRequest,
        'gpt-4'
      );
      const chatResult = transformClaudeToAzureRequest(chatRequest, 'gpt-4');

      // Should have same structure except for user ID
      expect(legacyResult.model).toBe(chatResult.model);
      expect(legacyResult.messages).toEqual(chatResult.messages);
      expect(legacyResult.max_tokens).toBe(chatResult.max_tokens);
      expect(legacyResult.temperature).toBe(chatResult.temperature);
    });

    it('should handle both formats in validation', () => {
      const legacyRequest: ClaudeCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello',
        max_tokens: 100,
      };

      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      const legacyResult = validateClaudeRequest(legacyRequest);
      const chatResult = validateClaudeRequest(chatRequest);

      expect('prompt' in legacyResult).toBe(true);
      expect('messages' in chatResult).toBe(true);
      expect(legacyResult).toEqual(legacyRequest);
      expect(chatResult).toEqual(chatRequest);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long conversations', () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i + 1}`,
      }));

      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages,
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      expect('messages' in result && result.messages).toHaveLength(50);
    });

    it('should reject conversations that are too long', () => {
      const messages = Array.from({ length: 101 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i + 1}`,
      }));

      const chatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages,
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(chatRequest)).toThrow();
    });

    it('should handle Unicode in messages', () => {
      const chatRequest: ClaudeChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello 世界 🌍 café naïve résumé ∑∫∆√π' },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      const azureResult = transformClaudeToAzureRequest(result, 'gpt-4');

      expect('messages' in result && result.messages[0].content).toBe(
        'Hello 世界 🌍 café naïve résumé ∑∫∆√π'
      );
      expect(azureResult.messages[0].content).toBe(
        'Hello 世界 🌍 café naïve résumé ∑∫∆√π'
      );
    });
  });
});
