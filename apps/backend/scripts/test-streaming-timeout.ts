/**
 * Test script to investigate streaming timeout behavior
 *
 * This script tests Azure OpenAI streaming with different timeout configurations
 * to identify if timeout is causing the "canceled" error.
 */

import axios from 'axios';
import { config } from '../src/config/index.js';
import { logger } from '../src/middleware/logging.js';

interface TestResult {
  timeoutMs: number;
  success: boolean;
  error?: string;
  duration?: number;
  chunksReceived?: number;
}

/**
 * Test streaming with specific timeout
 */
async function testStreamingWithTimeout(
  timeoutMs: number,
  useAbortController: boolean = true
): Promise<TestResult> {
  const startTime = Date.now();
  let chunksReceived = 0;

  const abortController = useAbortController
    ? new AbortController()
    : undefined;

  try {
    logger.info('Testing streaming with timeout', '', {
      timeoutMs,
      useAbortController,
      timestamp: new Date().toISOString(),
    });

    const response = await axios.post(
      `${config.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`,
      {
        model: config.AZURE_OPENAI_MODEL,
        input: [
          {
            role: 'user',
            content: 'Write a short poem about coding. Keep it under 50 words.',
          },
        ],
        max_output_tokens: 200,
        stream: true,
      },
      {
        headers: {
          'api-key': config.AZURE_OPENAI_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        signal: abortController?.signal,
        timeout: timeoutMs,
      }
    );

    logger.info('Response received', '', {
      status: response.status,
      contentType: response.headers['content-type'],
      timeoutMs,
    });

    return new Promise((resolve, reject) => {
      let buffer = '';
      let completed = false;

      response.data.on('data', (chunk: Buffer) => {
        chunksReceived++;
        buffer += chunk.toString();

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]' || data.includes('response.completed')) {
              completed = true;
              const duration = Date.now() - startTime;
              logger.info('Stream completed successfully', '', {
                timeoutMs,
                duration,
                chunksReceived,
              });
              resolve({
                timeoutMs,
                success: true,
                duration,
                chunksReceived,
              });
            }
          }
        }
      });

      response.data.on('error', (error: Error) => {
        if (!completed) {
          const duration = Date.now() - startTime;
          logger.error('Stream error', '', {
            timeoutMs,
            error: error.message,
            duration,
            chunksReceived,
          });
          reject({
            timeoutMs,
            success: false,
            error: error.message,
            duration,
            chunksReceived,
          });
        }
      });

      response.data.on('end', () => {
        if (!completed) {
          const duration = Date.now() - startTime;
          logger.info('Stream ended without completion marker', '', {
            timeoutMs,
            duration,
            chunksReceived,
          });
          resolve({
            timeoutMs,
            success: true,
            duration,
            chunksReceived,
          });
        }
      });

      // Add timeout handler
      setTimeout(() => {
        if (!completed) {
          completed = true;
          const duration = Date.now() - startTime;
          logger.warn('Test timeout reached', '', {
            timeoutMs,
            duration,
            chunksReceived,
          });
          reject({
            timeoutMs,
            success: false,
            error: 'Test timeout',
            duration,
            chunksReceived,
          });
        }
      }, timeoutMs + 5000); // Add 5s buffer
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (axios.isAxiosError(error)) {
      const isCanceled =
        error.code === 'ERR_CANCELED' || error.message.includes('canceled');
      const isTimeout =
        error.code === 'ECONNABORTED' || error.message.includes('timeout');

      logger.error('Axios error during streaming test', '', {
        timeoutMs,
        error: error.message,
        errorCode: error.code,
        isCanceled,
        isTimeout,
        duration,
        chunksReceived,
        signalAborted: abortController?.signal.aborted,
        signalReason: abortController?.signal.reason,
      });

      return {
        timeoutMs,
        success: false,
        error: `${error.code}: ${error.message}`,
        duration,
        chunksReceived,
      };
    }

    logger.error('Unknown error during streaming test', '', {
      timeoutMs,
      error: error instanceof Error ? error.message : String(error),
      duration,
      chunksReceived,
    });

    return {
      timeoutMs,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      chunksReceived,
    };
  }
}

/**
 * Run comprehensive timeout tests
 */
async function runTimeoutTests(): Promise<void> {
  console.log('\n=== Streaming Timeout Investigation ===\n');
  console.log(`Azure OpenAI Endpoint: ${config.AZURE_OPENAI_ENDPOINT}`);
  console.log(`Model: ${config.AZURE_OPENAI_MODEL}`);
  console.log(`Current Timeout: ${config.AZURE_OPENAI_TIMEOUT}ms\n`);

  const timeouts = [
    30000, // 30 seconds
    60000, // 60 seconds
    120000, // 120 seconds (current default)
    180000, // 180 seconds
    300000, // 300 seconds (5 minutes)
  ];

  const results: TestResult[] = [];

  // Test with AbortController
  console.log('--- Testing WITH AbortController ---\n');
  for (const timeout of timeouts) {
    console.log(`Testing timeout: ${timeout}ms (${timeout / 1000}s)`);
    try {
      const result = await testStreamingWithTimeout(timeout, true);
      results.push(result);
      console.log(
        `✓ Success: ${result.duration}ms, ${result.chunksReceived} chunks\n`
      );
    } catch (error: any) {
      results.push(error);
      console.log(`✗ Failed: ${error.error}\n`);
    }

    // Wait between tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Test without AbortController
  console.log('\n--- Testing WITHOUT AbortController ---\n');
  console.log(
    `Testing timeout: ${config.AZURE_OPENAI_TIMEOUT}ms (${config.AZURE_OPENAI_TIMEOUT / 1000}s)`
  );
  try {
    const result = await testStreamingWithTimeout(
      config.AZURE_OPENAI_TIMEOUT,
      false
    );
    results.push(result);
    console.log(
      `✓ Success: ${result.duration}ms, ${result.chunksReceived} chunks\n`
    );
  } catch (error: any) {
    results.push(error);
    console.log(`✗ Failed: ${error.error}\n`);
  }

  // Test with no timeout
  console.log('\n--- Testing with NO timeout (0) ---\n');
  try {
    const result = await testStreamingWithTimeout(0, true);
    results.push(result);
    console.log(
      `✓ Success: ${result.duration}ms, ${result.chunksReceived} chunks\n`
    );
  } catch (error: any) {
    results.push(error);
    console.log(`✗ Failed: ${error.error}\n`);
  }

  // Print summary
  console.log('\n=== Test Summary ===\n');
  console.log('Timeout (ms) | Success | Duration (ms) | Chunks | Error');
  console.log('-------------|---------|---------------|--------|-------');

  for (const result of results) {
    const success = result.success ? '✓' : '✗';
    const duration = result.duration || 'N/A';
    const chunks = result.chunksReceived || 0;
    const error = result.error || '';
    console.log(
      `${result.timeoutMs.toString().padEnd(12)} | ${success.padEnd(7)} | ${duration.toString().padEnd(13)} | ${chunks.toString().padEnd(6)} | ${error}`
    );
  }

  console.log('\n=== Recommendations ===\n');

  const successfulTests = results.filter((r) => r.success);
  const failedTests = results.filter((r) => !r.success);

  if (successfulTests.length === 0) {
    console.log(
      '⚠️  All tests failed. This indicates a fundamental issue with the streaming setup.'
    );
    console.log(
      '   Check: API endpoint, API key, model deployment, network connectivity'
    );
  } else if (failedTests.length === 0) {
    console.log('✓ All tests passed. Timeout is not the issue.');
    console.log('  The "canceled" error is likely caused by something else.');
  } else {
    const minSuccessfulTimeout = Math.min(
      ...successfulTests.map((r) => r.timeoutMs)
    );
    const maxFailedTimeout = Math.max(...failedTests.map((r) => r.timeoutMs));

    if (minSuccessfulTimeout > maxFailedTimeout) {
      console.log(
        `✓ Increase timeout to at least ${minSuccessfulTimeout}ms (${minSuccessfulTimeout / 1000}s)`
      );
      console.log(
        `  Current timeout of ${config.AZURE_OPENAI_TIMEOUT}ms may be too short.`
      );
    } else {
      console.log('⚠️  Mixed results. Timeout may not be the primary issue.');
      console.log('   Consider investigating AbortController signal behavior.');
    }
  }

  console.log('\n');
}

// Run tests
runTimeoutTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
