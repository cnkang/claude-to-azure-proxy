/**
 * Test script for debugging AbortController signal behavior
 * 
 * This script tests streaming with and without AbortController to isolate
 * whether the AbortController is causing premature cancellation.
 * 
 * Usage:
 *   pnpm tsx apps/backend/scripts/test-abort-controller.ts [mode]
 * 
 * Modes:
 *   with-abort    - Test with AbortController (default)
 *   without-abort - Test without AbortController
 *   both          - Run both tests sequentially
 */

import axios from 'axios';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

interface TestConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  useAbortController: boolean;
}

function getTestConfig(): TestConfig {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const model = process.env.AZURE_OPENAI_MODEL;
  
  if (!endpoint || !apiKey || !model) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const mode = process.argv[2] || 'with-abort';
  const useAbortController = mode !== 'without-abort';

  return { endpoint, apiKey, model, useAbortController };
}

async function testStreamingWithAbortController(config: TestConfig): Promise<void> {
  console.log('\n=== Testing WITH AbortController ===\n');

  const abortController = new AbortController();
  const startTime = Date.now();
  let chunkCount = 0;

  // Log signal state at key points
  const logSignalState = (point: string) => {
    console.log(`[${point}] Signal state:`);
    console.log(`  - aborted: ${abortController.signal.aborted}`);
    console.log(`  - reason: ${abortController.signal.reason}`);
    console.log(`  - elapsed: ${Date.now() - startTime}ms\n`);
  };

  try {
    logSignalState('BEFORE REQUEST');

    const requestBody = {
      model: config.model,
      input: [
        {
          role: 'user',
          content: 'Explain quantum computing in detail.',
        },
      ],
      max_output_tokens: 2000,
      stream: true,
    };

    const response = await axios.post(
      `${config.endpoint}/openai/v1/responses`,
      requestBody,
      {
        headers: {
          'api-key': config.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        responseType: 'stream',
        signal: abortController.signal,
        timeout: 120000,
      }
    );

    logSignalState('AFTER RESPONSE');

    let buffer = '';
    let contentReceived = '';

    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      
      if (chunkCount === 1) {
        logSignalState('FIRST CHUNK');
      }

      // Parse SSE data
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            logSignalState('DONE MARKER');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              contentReceived += parsed.delta;
            } else if (parsed.type === 'response.completed') {
              logSignalState('COMPLETED EVENT');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    response.data.on('error', (error: Error) => {
      console.error(`\n❌ Stream error: ${error.message}`);
      logSignalState('ON ERROR');
    });

    response.data.on('end', () => {
      console.log(`\n✅ Stream ended successfully`);
      console.log(`   Chunks: ${chunkCount}`);
      console.log(`   Content length: ${contentReceived.length}`);
      logSignalState('ON END');
    });

    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error(`\n❌ Request failed:`);
    if (axios.isAxiosError(error)) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      console.error(`   Is canceled: ${error.code === 'ERR_CANCELED'}`);
    }
    logSignalState('ON CATCH');
    throw error;
  }
}

async function testStreamingWithoutAbortController(config: TestConfig): Promise<void> {
  console.log('\n=== Testing WITHOUT AbortController ===\n');

  const startTime = Date.now();
  let chunkCount = 0;

  try {
    console.log('[BEFORE REQUEST] No AbortController\n');

    const requestBody = {
      model: config.model,
      input: [
        {
          role: 'user',
          content: 'Explain quantum computing in detail.',
        },
      ],
      max_output_tokens: 2000,
      stream: true,
    };

    const response = await axios.post(
      `${config.endpoint}/openai/v1/responses`,
      requestBody,
      {
        headers: {
          'api-key': config.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        responseType: 'stream',
        // NO signal property
        timeout: 120000,
      }
    );

    console.log(`[AFTER RESPONSE] Status: ${response.status}\n`);

    let buffer = '';
    let contentReceived = '';

    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      
      if (chunkCount === 1) {
        console.log('[FIRST CHUNK] Received\n');
      }

      // Parse SSE data
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            console.log('[DONE MARKER] Received\n');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              contentReceived += parsed.delta;
            } else if (parsed.type === 'response.completed') {
              console.log('[COMPLETED EVENT] Received\n');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    response.data.on('error', (error: Error) => {
      console.error(`\n❌ Stream error: ${error.message}\n`);
    });

    response.data.on('end', () => {
      const elapsed = Date.now() - startTime;
      console.log(`\n✅ Stream ended successfully`);
      console.log(`   Chunks: ${chunkCount}`);
      console.log(`   Content length: ${contentReceived.length}`);
      console.log(`   Elapsed: ${elapsed}ms\n`);
    });

    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error(`\n❌ Request failed:`);
    if (axios.isAxiosError(error)) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
    }
    throw error;
  }
}

// Run tests
const config = getTestConfig();
const mode = process.argv[2] || 'with-abort';

async function runTests() {
  if (mode === 'both') {
    console.log('Running both tests...\n');
    
    try {
      await testStreamingWithAbortController(config);
      console.log('\n✅ Test WITH AbortController passed\n');
    } catch (error) {
      console.error('\n❌ Test WITH AbortController failed\n');
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests

    try {
      await testStreamingWithoutAbortController(config);
      console.log('\n✅ Test WITHOUT AbortController passed\n');
    } catch (error) {
      console.error('\n❌ Test WITHOUT AbortController failed\n');
    }
  } else if (mod