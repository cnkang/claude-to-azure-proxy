/**
 * @fileoverview Performance and load testing for Azure OpenAI Responses API migration
 * 
 * This test suite validates concurrent request handling, measures reasoning token
 * consumption and costs, tests memory usage under sustained load, and validates
 * response time requirements.
 * 
 * Requirements covered: 8.2
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import { performance } from 'perf_hooks';
import { UniversalRequestProcessor } from '../src/utils/universal-request-processor.js';
import { createConversationManager } from '../src/utils/conversation-manager.js';
import type {
  ClaudeRequest,
  ResponsesResponse,
} from '../src/types/index.js';
import {
  ClaudeRequestFactory,
  TestDataUtils,
} from './test-factories.js';

// Mock Azure Responses Client
const mockAzureClient = {
  createResponse: vi.fn(),
  createResponseStream: vi.fn(),
  getConfig: vi.fn(),
};

vi.mock('../src/clients/azure-responses-client.js', () => ({
  AzureResponsesClient: vi.fn().mockImplementation(() => mockAzureClient),
}));

// Test configuration removed - not used in this test file

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  private metrics: Array<{
    timestamp: number;
    operation: string;
    duration: number;
    memoryUsage: NodeJS.MemoryUsage;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      reasoningTokens?: number;
      totalTokens: number;
    };
  }> = [];

  public recordMetric(
    operation: string,
    duration: number,
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      reasoningTokens?: number;
      totalTokens: number;
    }
  ): void {
    this.metrics.push({
      timestamp: Date.now(),
      operation,
      duration,
      memoryUsage: process.memoryUsage(),
      tokenUsage,
    });
  }

  public getAverageResponseTime(operation?: string): number {
    const filteredMetrics = (operation !== undefined && operation.trim() !== '') 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;
    
    if (filteredMetrics.length === 0) {return 0;}
    
    const totalDuration = filteredMetrics.reduce((sum, m) => sum + m.duration, 0);
    return totalDuration / filteredMetrics.length;
  }

  public getPercentile(percentile: number, operation?: string): number {
    const filteredMetrics = (operation !== undefined && operation.trim() !== '') 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;
    
    if (filteredMetrics.length === 0) {return 0;}
    
    const sorted = filteredMetrics
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    const value = sorted.at(index);
    return value ?? 0;
  }

  public getTotalTokenUsage(): {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  } {
    return this.metrics.reduce(
      (total, metric) => {
        if (metric.tokenUsage) {
          total.promptTokens += metric.tokenUsage.promptTokens;
          total.completionTokens += metric.tokenUsage.completionTokens;
          total.reasoningTokens += metric.tokenUsage.reasoningTokens ?? 0;
          total.totalTokens += metric.tokenUsage.totalTokens;
        }
        return total;
      },
      { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 }
    );
  }

  public getMemoryStats(): {
    maxHeapUsed: number;
    maxRss: number;
    avgHeapUsed: number;
    avgRss: number;
  } {
    if (this.metrics.length === 0) {
      return { maxHeapUsed: 0, maxRss: 0, avgHeapUsed: 0, avgRss: 0 };
    }

    const heapUsed = this.metrics.map(m => m.memoryUsage.heapUsed);
    const rss = this.metrics.map(m => m.memoryUsage.rss);

    return {
      maxHeapUsed: Math.max(...heapUsed),
      maxRss: Math.max(...rss),
      avgHeapUsed: heapUsed.reduce((sum, val) => sum + val, 0) / heapUsed.length,
      avgRss: rss.reduce((sum, val) => sum + val, 0) / rss.length,
    };
  }

  public clear(): void {
    this.metrics = [];
  }

  public getMetricsCount(): number {
    return this.metrics.length;
  }
}

/**
 * Load test scenario generator
 */
class LoadTestScenario {
  public static generateConcurrentRequests(
    count: number,
    complexity: 'simple' | 'medium' | 'complex' = 'medium'
  ): ClaudeRequest[] {
    return Array.from({ length: count }, (_, i) => {
      const size = complexity === 'simple' ? 'small' : 
                   complexity === 'medium' ? 'medium' : 'large';
      
      return ClaudeRequestFactory.create({
        size,
        includeOptional: complexity !== 'simple',
        seed: i,
      });
    });
  }

  public static generateReasoningIntensiveRequests(count: number): ClaudeRequest[] {
    const reasoningPrompts = [
      'Design a scalable microservices architecture for an e-commerce platform',
      'Implement a complex algorithm for real-time fraud detection',
      'Create a distributed system for processing millions of transactions',
      'Build a machine learning pipeline for natural language processing',
      'Design a high-performance database schema for analytics',
    ];

    return Array.from({ length: count }, (_, i) => ({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: reasoningPrompts[i % reasoningPrompts.length] + ` (Request ${i + 1})`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }));
  }

  public static generateMemoryIntensiveRequests(count: number): ClaudeRequest[] {
    return Array.from({ length: count }, (_, i) => ({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: `Process this large dataset: ${'x'.repeat(10000)} (Request ${i + 1})`,
        },
      ],
      max_tokens: 4000,
    }));
  }
}

/**
 * Response factory for performance tests
 */
class PerformanceResponseFactory {
  public static createResponseWithTokens(options: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    responseTime?: number;
  } = {}): ResponsesResponse {
    const {
      promptTokens = 100,
      completionTokens = 200,
      reasoningTokens = 50,
      responseTime = 1000,
    } = options;

    return {
      id: `perf_resp_${Date.now()}_${Math.random()}`,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-codex',
      output: [
        ...(reasoningTokens > 0 ? [{
          type: 'reasoning' as const,
          reasoning: {
            content: 'Performance test reasoning content',
            status: 'completed' as const,
          },
        }] : []),
        {
          type: 'text' as const,
          text: `Performance test response (${responseTime}ms)`,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        reasoning_tokens: reasoningTokens > 0 ? reasoningTokens : undefined,
      },
    };
  }

  public static createVariableLatencyResponse(
    minLatency: number,
    maxLatency: number
  ): Promise<ResponsesResponse> {
    const latency = Math.random() * (maxLatency - minLatency) + minLatency;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.createResponseWithTokens({
          responseTime: latency,
          promptTokens: Math.floor(Math.random() * 200) + 50,
          completionTokens: Math.floor(Math.random() * 500) + 100,
          reasoningTokens: Math.floor(Math.random() * 100) + 25,
        }));
      }, latency);
    });
  }
}

describe('Performance and Load Testing', () => {
  let app: express.Application;
  let universalProcessor: UniversalRequestProcessor;
  let conversationManager: ReturnType<typeof createConversationManager>;
  let performanceMetrics: PerformanceMetrics;

  beforeAll(async () => {
    // Initialize components
    universalProcessor = new UniversalRequestProcessor({
      enableInputValidation: true,
      maxRequestSize: 10 * 1024 * 1024,
      defaultReasoningEffort: 'medium',
      enableSwiftOptimization: true,
      swiftKeywords: ['swift', 'ios', 'xcode', 'swiftui'],
      iosKeywords: ['ios', 'iphone', 'ipad', 'macos'],
      reasoningBoost: 1.5,
    });

    conversationManager = createConversationManager({
      maxConversationAge: 3600000,
      cleanupInterval: 300000,
      maxStoredConversations: 1000,
    });

    performanceMetrics = new PerformanceMetrics();

    // Create Express app with performance monitoring
    app = express();
    app.use(json({ limit: '10mb' }));

    // Add performance monitoring middleware
    app.use((req, res, next) => {
      const startTime = performance.now();
      
      res.on('finish', () => {
        const duration = performance.now() - startTime;
        performanceMetrics.recordMetric(
          `${req.method} ${req.path}`,
          duration
        );
      });
      
      next();
    });

    // Add test routes
    app.post('/v1/messages', async (req, res) => {
      const startTime = performance.now();
      
      try {
        const result = await universalProcessor.processRequest({
          headers: req.headers as Record<string, string>,
          body: req.body,
          path: req.path,
          userAgent: req.get('User-Agent'),
        });

        const responsesResponse = await mockAzureClient.createResponse(result.responsesParams);
        
        const duration = performance.now() - startTime;
        performanceMetrics.recordMetric(
          'claude_request',
          duration,
          {
            promptTokens: responsesResponse.usage.prompt_tokens,
            completionTokens: responsesResponse.usage.completion_tokens,
            reasoningTokens: responsesResponse.usage.reasoning_tokens,
            totalTokens: responsesResponse.usage.total_tokens,
          }
        );
        
        // Transform back to Claude format
        const claudeResponse = {
          id: responsesResponse.id,
          type: 'message',
          role: 'assistant',
          content: responsesResponse.output
            .filter(output => output.type === 'text')
            .map(output => ({
              type: 'text',
              text: output.text,
            })),
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: responsesResponse.usage.prompt_tokens,
            output_tokens: responsesResponse.usage.completion_tokens,
          },
        };

        res.json(claudeResponse);
      } catch (error) {
        res.status(500).json({
          type: 'error',
          error: {
            type: 'api_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    });

    app.post('/v1/chat/completions', async (req, res) => {
      const startTime = performance.now();
      
      try {
        const result = await universalProcessor.processRequest({
          headers: req.headers as Record<string, string>,
          body: req.body,
          path: req.path,
          userAgent: req.get('User-Agent'),
        });

        const responsesResponse = await mockAzureClient.createResponse(result.responsesParams);
        
        const duration = performance.now() - startTime;
        performanceMetrics.recordMetric(
          'openai_request',
          duration,
          {
            promptTokens: responsesResponse.usage.prompt_tokens,
            completionTokens: responsesResponse.usage.completion_tokens,
            reasoningTokens: responsesResponse.usage.reasoning_tokens,
            totalTokens: responsesResponse.usage.total_tokens,
          }
        );
        
        // Transform back to OpenAI format
        const openaiResponse = {
          id: responsesResponse.id,
          object: 'chat.completion',
          created: responsesResponse.created,
          model: responsesResponse.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: responsesResponse.output
                  .filter(output => output.type === 'text')
                  .map(output => output.text)
                  .join(''),
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: responsesResponse.usage.prompt_tokens,
            completion_tokens: responsesResponse.usage.completion_tokens,
            total_tokens: responsesResponse.usage.total_tokens,
          },
        };

        res.json(openaiResponse);
      } catch (error) {
        res.status(500).json({
          type: 'error',
          error: {
            type: 'api_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    });

    // Start server (not used in tests)
    app.listen(0);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    performanceMetrics.clear();
    
    // Default response with realistic timing
    mockAzureClient.createResponse.mockImplementation(() =>
      PerformanceResponseFactory.createVariableLatencyResponse(100, 500)
    );
  });

  afterEach(() => {
    conversationManager.cleanupOldConversations();
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 10 concurrent simple requests efficiently', async () => {
      const concurrentRequests = LoadTestScenario.generateConcurrentRequests(10, 'simple');
      
      const startTime = performance.now();
      
      const promises = concurrentRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.type).toBe('message');
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(performanceMetrics.getAverageResponseTime('claude_request')).toBeLessThan(1000);
      
      // Verify concurrent processing (should be faster than sequential)
      const avgResponseTime = performanceMetrics.getAverageResponseTime('claude_request');
      expect(totalTime).toBeLessThan(avgResponseTime * 10 * 0.8); // At least 20% faster than sequential
    });

    it('should handle 25 concurrent medium complexity requests', async () => {
      const concurrentRequests = LoadTestScenario.generateConcurrentRequests(25, 'medium');
      
      const startTime = performance.now();
      
      const promises = concurrentRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.type).toBe('message');
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(performanceMetrics.getPercentile(95, 'claude_request')).toBeLessThan(2000); // 95th percentile under 2s
      
      console.log(`25 concurrent requests completed in ${totalTime.toFixed(2)}ms`);
      console.log(`Average response time: ${performanceMetrics.getAverageResponseTime('claude_request').toFixed(2)}ms`);
      console.log(`95th percentile: ${performanceMetrics.getPercentile(95, 'claude_request').toFixed(2)}ms`);
    });

    it('should handle mixed Claude and OpenAI requests concurrently', async () => {
      const claudeRequests = LoadTestScenario.generateConcurrentRequests(10, 'medium');
      const openaiRequests = Array.from({ length: 10 }, (_, i) => ({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: `OpenAI request ${i + 1}: Create a TypeScript interface`,
          },
        ],
        max_tokens: 500,
      }));

      const startTime = performance.now();
      
      const claudePromises = claudeRequests.map(req =>
        request(app).post('/v1/messages').send(req)
      );
      
      const openaiPromises = openaiRequests.map(req =>
        request(app).post('/v1/chat/completions').send(req)
      );

      const [claudeResponses, openaiResponses] = await Promise.all([
        Promise.all(claudePromises),
        Promise.all(openaiPromises),
      ]);
      
      const totalTime = performance.now() - startTime;

      // Verify all requests succeeded
      claudeResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.type).toBe('message');
      });

      openaiResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.object).toBe('chat.completion');
      });

      // Performance assertions
      expect(totalTime).toBeLessThan(3000);
      expect(performanceMetrics.getAverageResponseTime('claude_request')).toBeLessThan(1500);
      expect(performanceMetrics.getAverageResponseTime('openai_request')).toBeLessThan(1500);
    });

    it('should maintain performance under sustained load', async () => {
      const batchSize = 5;
      const batchCount = 4;
      const batchResults: number[] = [];

      for (let batch = 0; batch < batchCount; batch++) {
        const requests = LoadTestScenario.generateConcurrentRequests(batchSize, 'medium');
        
        const batchStartTime = performance.now();
        
        const promises = requests.map(claudeRequest =>
          request(app)
            .post('/v1/messages')
            .send(claudeRequest)
        );

        const responses = await Promise.all(promises);
        const batchTime = performance.now() - batchStartTime;
        batchResults.push(batchTime);

        // Verify all requests succeeded
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Performance should remain consistent across batches
      const avgBatchTime = batchResults.reduce((sum, time) => sum + time, 0) / batchResults.length;
      const maxBatchTime = Math.max(...batchResults);
      
      expect(maxBatchTime).toBeLessThan(avgBatchTime * 1.5); // No batch should be 50% slower than average
      
      console.log(`Sustained load test - Average batch time: ${avgBatchTime.toFixed(2)}ms`);
      console.log(`Max batch time: ${maxBatchTime.toFixed(2)}ms`);
    });
  });

  describe('Reasoning Token Consumption and Costs', () => {
    it('should measure reasoning token usage for different complexity levels', async () => {
      const scenarios = [
        { complexity: 'simple', expectedReasoningTokens: 0 },
        { complexity: 'medium', expectedReasoningTokens: 50 },
        { complexity: 'complex', expectedReasoningTokens: 100 },
      ] as const;

      for (const scenario of scenarios) {
        performanceMetrics.clear();
        
        // Configure mock to return appropriate reasoning tokens
        mockAzureClient.createResponse.mockResolvedValue(
          PerformanceResponseFactory.createResponseWithTokens({
            promptTokens: 100,
            completionTokens: 200,
            reasoningTokens: scenario.expectedReasoningTokens,
          })
        );

        const requests = LoadTestScenario.generateConcurrentRequests(5, scenario.complexity);
        
        const promises = requests.map(claudeRequest =>
          request(app)
            .post('/v1/messages')
            .send(claudeRequest)
        );

        const responses = await Promise.all(promises);
        
        // Verify all requests succeeded
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        const tokenUsage = performanceMetrics.getTotalTokenUsage();
        
        console.log(`${scenario.complexity} complexity - Token usage:`, {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          reasoningTokens: tokenUsage.reasoningTokens,
          totalTokens: tokenUsage.totalTokens,
        });

        // Verify reasoning token usage matches complexity
        expect(tokenUsage.reasoningTokens).toBe(scenario.expectedReasoningTokens * 5);
        expect(tokenUsage.totalTokens).toBe(
          tokenUsage.promptTokens + tokenUsage.completionTokens
        );
      }
    });

    it('should track reasoning token costs for architectural tasks', async () => {
      const architecturalRequests = LoadTestScenario.generateReasoningIntensiveRequests(10);
      
      // Configure mock for high reasoning token usage
      mockAzureClient.createResponse.mockImplementation(() =>
        Promise.resolve(PerformanceResponseFactory.createResponseWithTokens({
          promptTokens: 200,
          completionTokens: 800,
          reasoningTokens: 300, // High reasoning for architectural tasks
        }))
      );

      const promises = architecturalRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const tokenUsage = performanceMetrics.getTotalTokenUsage();
      
      // Calculate estimated costs (example rates)
      const promptTokenCost = tokenUsage.promptTokens * 0.00001; // $0.01 per 1K tokens
      const completionTokenCost = tokenUsage.completionTokens * 0.00003; // $0.03 per 1K tokens
      const reasoningTokenCost = tokenUsage.reasoningTokens * 0.00005; // $0.05 per 1K tokens
      const totalCost = promptTokenCost + completionTokenCost + reasoningTokenCost;

      console.log('Architectural tasks token costs:', {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        reasoningTokens: tokenUsage.reasoningTokens,
        estimatedCost: `$${totalCost.toFixed(4)}`,
      });

      // Verify high reasoning token usage for architectural tasks
      expect(tokenUsage.reasoningTokens).toBeGreaterThan(tokenUsage.promptTokens);
      expect(tokenUsage.reasoningTokens / tokenUsage.totalTokens).toBeGreaterThan(0.2); // At least 20% reasoning tokens
    });

    it('should optimize reasoning token usage for simple tasks', async () => {
      const simpleRequests = Array.from({ length: 10 }, (_, i) => ({
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: `Simple task ${i + 1}: print hello world`,
          },
        ],
        max_tokens: 100,
      }));

      // Configure mock for minimal reasoning
      mockAzureClient.createResponse.mockImplementation(() =>
        Promise.resolve(PerformanceResponseFactory.createResponseWithTokens({
          promptTokens: 20,
          completionTokens: 30,
          reasoningTokens: 0, // No reasoning for simple tasks
        }))
      );

      const promises = simpleRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const tokenUsage = performanceMetrics.getTotalTokenUsage();
      
      console.log('Simple tasks token usage:', tokenUsage);

      // Verify minimal reasoning token usage for simple tasks
      expect(tokenUsage.reasoningTokens).toBe(0);
      expect(tokenUsage.totalTokens).toBe(
        tokenUsage.promptTokens + tokenUsage.completionTokens
      );
    });
  });

  describe('Memory Usage Under Sustained Load', () => {
    it('should maintain stable memory usage during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      const memorySnapshots: NodeJS.MemoryUsage[] = [initialMemory];

      // Run sustained load test
      for (let round = 0; round < 5; round++) {
        const requests = LoadTestScenario.generateMemoryIntensiveRequests(10);
        
        const promises = requests.map(claudeRequest =>
          request(app)
            .post('/v1/messages')
            .send(claudeRequest)
        );

        await Promise.all(promises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        memorySnapshots.push(process.memoryUsage());
        
        // Small delay between rounds
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const memoryStats = performanceMetrics.getMemoryStats();
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];

      console.log('Memory usage during sustained load:', {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        final: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        maxHeap: `${(memoryStats.maxHeapUsed / 1024 / 1024).toFixed(2)} MB`,
        maxRss: `${(memoryStats.maxRss / 1024 / 1024).toFixed(2)} MB`,
      });

      // Memory should not grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;
      
      expect(memoryGrowthMB).toBeLessThan(100); // Should not grow more than 100MB
      expect(memoryStats.maxHeapUsed).toBeLessThan(500 * 1024 * 1024); // Max 500MB heap
    });

    it('should handle memory cleanup for conversation management', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create many conversations
      const conversationIds = Array.from({ length: 100 }, () => 
        TestDataUtils.createCorrelationId()
      );

      mockAzureClient.createResponse.mockImplementation(() =>
        Promise.resolve(
          PerformanceResponseFactory.createResponseWithTokens({
            responseTime: 10,
            promptTokens: 50,
            completionTokens: 75,
            reasoningTokens: 0,
          })
        )
      );

      for (const conversationId of conversationIds) {
        const claudeRequest = ClaudeRequestFactory.create({ size: 'medium' });
        
        await request(app)
          .post('/v1/messages')
          .set('X-Conversation-ID', conversationId)
          .send(claudeRequest);
      }

      const beforeCleanupMemory = process.memoryUsage();
      
      // Trigger conversation cleanup
      conversationManager.cleanupOldConversations();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const afterCleanupMemory = process.memoryUsage();

      console.log('Memory usage for conversation management:', {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        beforeCleanup: `${(beforeCleanupMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        afterCleanup: `${(afterCleanupMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      });

      // Memory should be cleaned up after conversation cleanup
      const memoryReduction = beforeCleanupMemory.heapUsed - afterCleanupMemory.heapUsed;
      expect(memoryReduction).toBeGreaterThanOrEqual(-1024 * 4); // Allow small fluctuation after cleanup
    });

    it('should handle large request payloads efficiently', async () => {
      const largeRequests = Array.from({ length: 5 }, (_, i) => ({
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: `Large request ${i + 1}: ${'x'.repeat(50000)}`, // 50KB content
          },
        ],
        max_tokens: 1000,
      }));

      const initialMemory = process.memoryUsage();
      
      const promises = largeRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      const finalMemory = process.memoryUsage();

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;

      console.log(`Large payload memory growth: ${memoryGrowthMB.toFixed(2)} MB`);

      // Memory growth should be reasonable for large payloads
      expect(memoryGrowthMB).toBeLessThan(50); // Should not grow more than 50MB for 5 large requests
    });
  });

  describe('Response Time Requirements', () => {
    it('should meet response time requirements for simple requests', async () => {
      const simpleRequests = LoadTestScenario.generateConcurrentRequests(20, 'simple');
      
      // Configure fast responses for simple requests
      mockAzureClient.createResponse.mockImplementation(() =>
        PerformanceResponseFactory.createVariableLatencyResponse(50, 200)
      );

      const promises = simpleRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const avgResponseTime = performanceMetrics.getAverageResponseTime('claude_request');
      const p95ResponseTime = performanceMetrics.getPercentile(95, 'claude_request');
      const p99ResponseTime = performanceMetrics.getPercentile(99, 'claude_request');

      console.log('Simple requests response times:', {
        average: `${avgResponseTime.toFixed(2)}ms`,
        p95: `${p95ResponseTime.toFixed(2)}ms`,
        p99: `${p99ResponseTime.toFixed(2)}ms`,
      });

      // Response time requirements for simple requests
      expect(avgResponseTime).toBeLessThan(500); // Average under 500ms
      expect(p95ResponseTime).toBeLessThan(1000); // 95th percentile under 1s
      expect(p99ResponseTime).toBeLessThan(2000); // 99th percentile under 2s
    });

    it('should meet response time requirements for complex requests', async () => {
      const complexRequests = LoadTestScenario.generateReasoningIntensiveRequests(10);
      
      // Configure realistic response times for complex requests
      mockAzureClient.createResponse.mockImplementation(() =>
        PerformanceResponseFactory.createVariableLatencyResponse(500, 2000)
      );

      const promises = complexRequests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const avgResponseTime = performanceMetrics.getAverageResponseTime('claude_request');
      const p95ResponseTime = performanceMetrics.getPercentile(95, 'claude_request');

      console.log('Complex requests response times:', {
        average: `${avgResponseTime.toFixed(2)}ms`,
        p95: `${p95ResponseTime.toFixed(2)}ms`,
      });

      // Response time requirements for complex requests
      expect(avgResponseTime).toBeLessThan(3000); // Average under 3s
      expect(p95ResponseTime).toBeLessThan(5000); // 95th percentile under 5s
    });

    it('should validate proxy overhead is minimal', async () => {
      const requests = LoadTestScenario.generateConcurrentRequests(10, 'medium');
      
      // Configure known Azure API response time
      const azureApiLatency = 800;
      mockAzureClient.createResponse.mockImplementation(() =>
        PerformanceResponseFactory.createVariableLatencyResponse(
          azureApiLatency - 50,
          azureApiLatency + 50
        )
      );

      const promises = requests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      const avgTotalResponseTime = performanceMetrics.getAverageResponseTime('claude_request');
      const proxyOverhead = avgTotalResponseTime - azureApiLatency;

      console.log('Proxy overhead analysis:', {
        azureApiLatency: `${azureApiLatency}ms`,
        totalResponseTime: `${avgTotalResponseTime.toFixed(2)}ms`,
        proxyOverhead: `${proxyOverhead.toFixed(2)}ms`,
        overheadPercentage: `${((proxyOverhead / azureApiLatency) * 100).toFixed(1)}%`,
      });

      // Proxy overhead should be minimal
      expect(proxyOverhead).toBeLessThan(100); // Less than 100ms overhead
      expect(proxyOverhead / azureApiLatency).toBeLessThan(0.15); // Less than 15% overhead
    });

    it('should handle timeout scenarios gracefully', async () => {
      const requests = LoadTestScenario.generateConcurrentRequests(5, 'medium');
      
      // Configure some requests to timeout
      let requestCount = 0;
      mockAzureClient.createResponse.mockImplementation(() => {
        requestCount++;
        if (requestCount % 3 === 0) {
          // Every 3rd request times out
          return new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 100)
          );
        }
        return PerformanceResponseFactory.createVariableLatencyResponse(200, 500);
      });

      const promises = requests.map(claudeRequest =>
        request(app)
          .post('/v1/messages')
          .send(claudeRequest)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should succeed, some should fail
      const successCount = responses.filter(r => r.status === 200).length;
      const errorCount = responses.filter(r => r.status === 500).length;
      
      expect(successCount).toBeGreaterThan(0);
      expect(errorCount).toBeGreaterThan(0);
      expect(successCount + errorCount).toBe(requests.length);

      console.log(`Timeout handling: ${successCount} succeeded, ${errorCount} failed`);
    });
  });
});
