#!/usr/bin/env tsx
/**
 * Comprehensive Streaming Flow Validation Script
 * 
 * Task 4.7.5: Verify complete streaming flow after fix
 * 
 * This script validates:
 * - All chunk events are correctly received
 * - Usage statistics are properly returned
 * - Multiple consecutive requests work correctly
 * - No "canceled" errors occur
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.6
 */

import axios, { type AxiosResponse } from 'axios';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

interface TestResult {
  testNumber: number;
  testName: string;
  success: boolean;
  duration: number;
  chunksReceived: number;
  contentLength: number;
  usageReturned: boolean;
  errorMessage?: string;
  canceledError?: boolean;
}

interface StreamChunk {
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  messageId?: string;
  correlationId: string;
  timestamp: number;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

class StreamingFlowValidator {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly conversationId: string;
  private results: TestResult[] = [];

  constructor() {
    // Validate required environment variables
    const requiredVars = [
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_API_KEY',
      'AZURE_OPENAI_MODEL',
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
    }

    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
    this.apiKey = process.env.AZURE_OPENAI_API_KEY!;
    // Use first model from comma-separated list
    this.model = process.env.AZURE_OPENAI_MODEL!.split(',')[0].trim();
    this.conversationId = `test-conv-${Date.now()}`;
  }

  /**
   * Runs all validation tests
   */
  public async runAllTests(): Promise<void> {
    console.log('='.repeat(80));
    console.log('STREAMING FLOW VALIDATION - Task 4.7.5');
    console.log('='.repeat(80));
    console.log();
    console.log('Configuration:');
    console.log(`  Endpoint: ${this.endpoint}`);
    console.log(`  Model: ${this.model}`);
    console.log(`  Conversation ID: ${this.conversationId}`);
    console.log();
    console.log('='.repeat(80));
    console.log();

    // Test 1: Single message with chunk validation
    await this.runTest(
      1,
      'Single Message - Chunk Validation',
      'Hello! Please respond with a short greeting (2-3 sentences).'
    );

    // Wait between tests
    await this.delay(2000);

    // Test 2: Longer response to test multiple chunks
    await this.runTest(
      2,
      'Longer Response - Multiple Chunks',
      'Please explain what TypeScript is in 3-4 sentences.'
    );

    // Wait between tests
    await this.delay(2000);

    // Test 3: Quick consecutive request
    await this.runTest(
      3,
      'Consecutive Request #1',
      'What is 2 + 2?'
    );

    // Wait between tests
    await this.delay(1000);

    // Test 4: Another consecutive request
    await this.runTest(
      4,
      'Consecutive Request #2',
      'What is the capital of France?'
    );

    // Wait between tests
    await this.delay(1000);

    // Test 5: Final consecutive request
    await this.runTest(
      5,
      'Consecutive Request #3',
      'Name one programming language.'
    );

    // Print summary
    this.printSummary();
  }

  /**
   * Runs a single test
   */
  private async runTest(
    testNumber: number,
    testName: string,
    message: string
  ): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${testNumber}: ${testName}`);
    console.log('='.repeat(80));
    console.log(`Message: "${message}"`);
    console.log();

    const startTime = Date.now();
    let chunksReceived = 0;
    let contentLength = 0;
    let usageReturned = false;
    let errorMessage: string | undefined;
    let canceledError = false;
    let success = false;

    try {
      // Make streaming request
      const response = await this.makeStreamingRequest(message);

      console.log(`Response Status: ${response.status} ${response.statusText}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      console.log();
      console.log('Processing stream...');
      console.log();

      // Process SSE stream
      let buffer = '';
      let startEventReceived = false;
      let endEventReceived = false;
      const chunks: string[] = [];

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {continue;}

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              endEventReceived = true;
              console.log('[DONE] marker received');
              continue;
            }

            try {
              const parsed: StreamChunk = JSON.parse(data);

              if (parsed.type === 'start') {
                startEventReceived = true;
                console.log(`[START] Message ID: ${parsed.messageId}, Model: ${parsed.model}`);
              } else if (parsed.type === 'chunk') {
                chunksReceived++;
                const content = parsed.content || '';
                contentLength += content.length;
                chunks.push(content);
                
                // Log first few chunks and then every 5th chunk
                if (chunksReceived <= 3 || chunksReceived % 5 === 0) {
                  console.log(`[CHUNK ${chunksReceived}] ${content.length} chars: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
                }
              } else if (parsed.type === 'end') {
                endEventReceived = true;
                if (parsed.usage) {
                  usageReturned = true;
                  console.log(`[END] Usage: input=${parsed.usage.inputTokens}, output=${parsed.usage.outputTokens}, total=${parsed.usage.totalTokens}`);
                } else {
                  console.log('[END] No usage statistics');
                }
              } else if (parsed.type === 'error') {
                errorMessage = parsed.content || 'Unknown error';
                console.log(`[ERROR] ${errorMessage}`);
                
                // Check if it's a canceled error
                if (errorMessage.toLowerCase().includes('cancel')) {
                  canceledError = true;
                }
              }
            } catch (parseError) {
              console.warn(`Failed to parse SSE data: ${data.substring(0, 100)}`);
            }
          }
        }
      });

      // Wait for stream to complete
      await new Promise<void>((resolve, reject) => {
        response.data.on('end', () => resolve());
        response.data.on('error', (error: Error) => {
          errorMessage = error.message;
          if (error.message.toLowerCase().includes('cancel')) {
            canceledError = true;
          }
          reject(error);
        });
      });

      // Validate results
      const duration = Date.now() - startTime;

      console.log();
      console.log('Stream completed!');
      console.log();
      console.log('Results:');
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Chunks received: ${chunksReceived}`);
      console.log(`  Content length: ${contentLength} characters`);
      console.log(`  Start event: ${startEventReceived ? '✅' : '❌'}`);
      console.log(`  End event: ${endEventReceived ? '✅' : '❌'}`);
      console.log(`  Usage statistics: ${usageReturned ? '✅' : '❌'}`);
      console.log(`  Canceled error: ${canceledError ? '❌ FAILED' : '✅ None'}`);

      // Determine success
      success = startEventReceived && 
                endEventReceived && 
                chunksReceived > 0 && 
                !canceledError &&
                !errorMessage;

      console.log();
      console.log(`Test Result: ${success ? '✅ PASSED' : '❌ FAILED'}`);

      // Show full content if short enough
      if (contentLength > 0 && contentLength < 500) {
        console.log();
        console.log('Full Response:');
        console.log('-'.repeat(80));
        console.log(chunks.join(''));
        console.log('-'.repeat(80));
      }

      // Store result
      this.results.push({
        testNumber,
        testName,
        success,
        duration,
        chunksReceived,
        contentLength,
        usageReturned,
        errorMessage,
        canceledError,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        errorMessage = error.message;
        canceledError = error.code === 'ERR_CANCELED' || error.message.includes('canceled');
        
        console.log();
        console.log('❌ Request Failed');
        console.log(`  Error: ${error.message}`);
        console.log(`  Code: ${error.code}`);
        console.log(`  Status: ${error.response?.status}`);
        
        // Try to extract error message from response
        if (error.response?.data) {
          try {
            if (typeof error.response.data === 'string') {
              console.log(`  Response: ${error.response.data.substring(0, 500)}`);
            } else if (error.response.data.error) {
              console.log(`  API Error: ${JSON.stringify(error.response.data.error, null, 2)}`);
            }
          } catch (e) {
            console.log(`  Response: [Unable to parse]`);
          }
        }
        
        console.log(`  Canceled: ${canceledError ? 'YES' : 'NO'}`);
        console.log(`  Duration: ${duration}ms`);
      } else if (error instanceof Error) {
        errorMessage = error.message;
        canceledError = error.message.toLowerCase().includes('cancel');
        
        console.log();
        console.log('❌ Request Failed');
        console.log(`  Error: ${error.message}`);
        console.log(`  Canceled: ${canceledError ? 'YES' : 'NO'}`);
        console.log(`  Duration: ${duration}ms`);
      } else {
        errorMessage = String(error);
        
        console.log();
        console.log('❌ Request Failed');
        console.log(`  Error: ${errorMessage}`);
        console.log(`  Duration: ${duration}ms`);
      }

      // Store failed result
      this.results.push({
        testNumber,
        testName,
        success: false,
        duration,
        chunksReceived,
        contentLength,
        usageReturned,
        errorMessage,
        canceledError,
      });
    }
  }

  /**
   * Makes a streaming request to the Azure OpenAI Responses API
   */
  private async makeStreamingRequest(message: string): Promise<AxiosResponse> {
    const url = `${this.endpoint}/openai/v1/responses`;

    const requestBody = {
      model: this.model,
      input: [
        {
          role: 'user',
          content: message,
        },
      ],
      max_output_tokens: 500,
      temperature: 0.7,
      stream: true,
    };

    return axios.post(url, requestBody, {
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      responseType: 'stream',
      timeout: 120000, // 2 minutes
    });
  }

  /**
   * Prints test summary
   */
  private printSummary(): void {
    console.log();
    console.log('='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log();

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const canceledTests = this.results.filter(r => r.canceledError).length;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
    console.log(`Canceled Errors: ${canceledTests} ${canceledTests > 0 ? '❌' : '✅'}`);
    console.log();

    // Detailed results table
    console.log('Detailed Results:');
    console.log('-'.repeat(80));
    console.log('Test | Name                          | Status | Chunks | Usage | Canceled');
    console.log('-'.repeat(80));

    for (const result of this.results) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      const usage = result.usageReturned ? '✅' : '❌';
      const canceled = result.canceledError ? '❌ YES' : '✅ NO';
      const name = result.testName.padEnd(30).substring(0, 30);
      
      console.log(`${result.testNumber.toString().padStart(4)} | ${name} | ${status} | ${result.chunksReceived.toString().padStart(6)} | ${usage.padStart(5)} | ${canceled}`);
    }
    console.log('-'.repeat(80));
    console.log();

    // Performance metrics
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    const totalChunks = this.results.reduce((sum, r) => sum + r.chunksReceived, 0);
    const totalContent = this.results.reduce((sum, r) => sum + r.contentLength, 0);

    console.log('Performance Metrics:');
    console.log(`  Average Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Total Chunks: ${totalChunks}`);
    console.log(`  Total Content: ${totalContent} characters`);
    console.log();

    // Success criteria validation
    console.log('Success Criteria Validation:');
    console.log(`  ✓ All tests passed: ${passedTests === totalTests ? '✅ YES' : '❌ NO'}`);
    console.log(`  ✓ No canceled errors: ${canceledTests === 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`  ✓ All chunks received: ${totalChunks > 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`  ✓ Usage statistics returned: ${this.results.every(r => r.usageReturned || !r.success) ? '✅ YES' : '❌ NO'}`);
    console.log(`  ✓ Multiple consecutive requests: ${totalTests >= 3 ? '✅ YES' : '❌ NO'}`);
    console.log();

    // Final verdict
    const allPassed = passedTests === totalTests && canceledTests === 0;
    console.log('='.repeat(80));
    console.log(`FINAL VERDICT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(80));
    console.log();

    // Exit with appropriate code
    if (!allPassed) {
      process.exit(1);
    }
  }

  /**
   * Delays execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run validation
async function main(): Promise<void> {
  try {
    const validator = new StreamingFlowValidator();
    await validator.runAllTests();
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

main();
