/**
 * Test Script: Streaming Without AbortController
 * 
 * This script tests Azure OpenAI streaming without using AbortController
 * to isolate whether the AbortController is causing the "canceled" error.
 * 
 * Usage: pnpm tsx apps/backend/scripts/test-streaming-without-abort.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

interface ResponsesAPIRequest {
  model: string;
  input: Array<{ role: string; content: string }>;
  max_output_tokens: number;
  stream: boolean;
  temperature?: number;
}

async function testStreamingWithoutAbort(): Promise<void> {
  console.log('=== Testing Azure OpenAI Streaming WITHOUT AbortController ===\n');

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const model = process.env.AZURE_OPENAI_MODEL || 'gpt-4o';

  if (!endpoint || !apiKey) {
    console.error('Error: Missing required environment variables');
    console.error('Required: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY');
    process.exit(1);
  }

  const url = `${endpoint}/openai/v1/responses`;

  const request: ResponsesAPIRequest = {
    model,
    input: [
      {
        role: 'user',
        content: 'Say "Hello, World!" and explain what this phrase means in programming.',
      },
    ],
    max_output_tokens: 500,
    stream: true,
    temperature: 0.7,
  };

  console.log('Request Configuration:');
  console.log(`  Endpoint: ${url}`);
  console.log(`  Model: ${model}`);
  console.log(`  Stream: ${request.stream}`);
  console.log(`  Max Output Tokens: ${request.max_output_tokens}`);
  console.log(`  Temperature: ${request.temperature}`);
  console.log('\nStarting request WITHOUT AbortController...\n');

  const startTime = Date.now();
  let chunkCount = 0;
  let accumulatedContent = '';
  let buffer = '';

  try {
    // Make request WITHOUT AbortController signal
    const response = await axios.post(url, request, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
      timeout: 120000, // 2 minutes
      // NOTE: No signal parameter - testing without AbortController
    });

    console.log(`Response received: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers['content-type']}`);
    console.log(`Transfer-Encoding: ${response.headers['transfer-encoding']}`);
    console.log('\nProcessing stream...\n');

    // Process stream
    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      const chunkSize = chunk.length;

      if (chunkCount === 1 || chunkCount % 10 === 0) {
        console.log(`[Chunk ${chunkCount}] Received ${chunkSize} bytes`);
      }

      // Append chunk to buffer
      buffer += chunk.toString();

      // Split by line endings
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      // Process complete lines
      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            console.log('\n[DONE] Stream completed');
            return;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              const content = parsed.delta;
              accumulatedContent += content;
              process.stdout.write(content);
            } else if (parsed.type === 'response.completed') {
              console.log('\n\n[COMPLETED] Response completed');
              if (parsed.response?.usage) {
                console.log('Usage:', parsed.response.usage);
              }
            } else if (parsed.type) {
              console.log(`\n[Event: ${parsed.type}]`);
            }
          } catch (parseError) {
            console.error('Parse error:', parseError);
          }
        }
      }
    });

    response.data.on('error', (error: Error) => {
      console.error('\n[ERROR] Stream error:', error.message);
      console.error('Error name:', error.name);
    });

    response.data.on('end', () => {
      const duration = Date.now() - startTime;
      console.log('\n\n=== Stream End ===');
      console.log(`Duration: ${duration}ms`);
      console.log(`Total chunks: ${chunkCount}`);
      console.log(`Content length: ${accumulatedContent.length} characters`);
      console.log(`Estimated tokens: ${Math.floor(accumulatedContent.length / 4)}`);
      console.log('\n✅ Test completed successfully WITHOUT AbortController');
    });

    // Wait for stream to complete
    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n\n=== Request Failed ===');
    console.error(`Duration: ${duration}ms`);

    if (axios.isAxiosError(error)) {
      console.error('Axios Error:');
      console.error(`  Code: ${error.code}`);
      console.error(`  Message: ${error.message}`);
      console.error(`  Status: ${error.response?.status}`);
      console.error(`  Status Text: ${error.response?.statusText}`);
      
      const isCanceled = error.code === 'ERR_CANCELED' || error.message.includes('canceled');
      const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
      
      console.error(`  Is Canceled: ${isCanceled}`);
      console.error(`  Is Timeout: ${isTimeout}`);
      
      if (isCanceled) {
        console.error('\n❌ Request was CANCELED even WITHOUT AbortController!');
        console.error('This suggests the issue is NOT with our AbortController usage.');
      } else if (isTimeout) {
        console.error('\n⏱️  Request TIMED OUT');
      }
    } else if (error instanceof Error) {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Unknown error:', error);
    }

    process.exit(1);
  }
}

// Run the test
testStreamingWithoutAbort().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
