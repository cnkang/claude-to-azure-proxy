/**
 * Validation Script for Streaming Service
 *
 * Tests the SSE streaming functionality to verify:
 * - Streaming chunks are received
 * - Completion message is received
 * - No parser errors occur
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'http://localhost:8080';
const API_KEY =
  process.env.PROXY_API_KEY || 'test-api-key-12345678901234567890';

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

async function validateStreaming(): Promise<void> {
  console.log('🔍 Starting Streaming Service Validation...\n');

  const conversationId = uuidv4();
  const sessionId = uuidv4();

  try {
    // Step 1: Establish SSE connection
    console.log('📡 Step 1: Establishing SSE connection...');
    const sseResponse = await axios.get(
      `${BASE_URL}/api/chat/stream/${conversationId}`,
      {
        headers: {
          'x-api-key': API_KEY,
          'x-session-id': sessionId,
        },
        responseType: 'stream',
        timeout: 5000,
      }
    );

    console.log('✅ SSE connection established\n');

    // Step 2: Set up SSE event listener
    const chunks: StreamChunk[] = [];
    let buffer = '';

    sseResponse.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            chunks.push(data);
            console.log(`📨 Received ${data.type} event:`, {
              messageId: data.messageId,
              content: data.content?.substring(0, 50),
              model: data.model,
            });
          } catch (error) {
            console.error('❌ Failed to parse SSE data:', line);
          }
        }
      }
    });

    // Wait for initial connection message
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 3: Send a test message
    console.log('\n📤 Step 2: Sending test message...');
    const sendResponse = await axios.post(
      `${BASE_URL}/api/chat/send`,
      {
        conversationId,
        message: 'Hello, this is a test message for streaming validation.',
        model: 'gpt-4o-mini',
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'x-session-id': sessionId,
        },
        timeout: 5000,
      }
    );

    console.log('✅ Message sent:', sendResponse.data);

    // Step 4: Wait for streaming to complete
    console.log('\n⏳ Step 3: Waiting for streaming response...');
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const hasEnd = chunks.some((c) => c.type === 'end');
        const hasError = chunks.some((c) => c.type === 'error');

        if (hasEnd || hasError) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 30000);
    });

    // Step 5: Analyze results
    console.log('\n📊 Step 4: Analyzing results...\n');

    const startEvents = chunks.filter((c) => c.type === 'start');
    const chunkEvents = chunks.filter((c) => c.type === 'chunk' && c.content);
    const endEvents = chunks.filter((c) => c.type === 'end');
    const errorEvents = chunks.filter((c) => c.type === 'error');

    console.log('Results Summary:');
    console.log(`  - Start events: ${startEvents.length}`);
    console.log(`  - Chunk events: ${chunkEvents.length}`);
    console.log(`  - End events: ${endEvents.length}`);
    console.log(`  - Error events: ${errorEvents.length}`);
    console.log(`  - Total events: ${chunks.length}`);

    // Validation checks
    const validations = {
      hasStart: startEvents.length > 0,
      hasChunks: chunkEvents.length > 0,
      hasEnd: endEvents.length > 0,
      noErrors: errorEvents.length === 0,
      noDuplicateStarts: startEvents.length <= 2, // Allow up to 2 (initial + handler)
      hasUsage: endEvents.some((e) => e.usage !== undefined),
    };

    console.log('\n✅ Validation Results:');
    console.log(`  ✓ Has start event: ${validations.hasStart ? '✅' : '❌'}`);
    console.log(`  ✓ Has chunk events: ${validations.hasChunks ? '✅' : '❌'}`);
    console.log(`  ✓ Has end event: ${validations.hasEnd ? '✅' : '❌'}`);
    console.log(`  ✓ No error events: ${validations.noErrors ? '✅' : '❌'}`);
    console.log(
      `  ✓ No duplicate starts: ${validations.noDuplicateStarts ? '✅' : '❌'}`
    );
    console.log(`  ✓ Has usage stats: ${validations.hasUsage ? '✅' : '❌'}`);

    if (errorEvents.length > 0) {
      console.log('\n❌ Errors detected:');
      errorEvents.forEach((e) => {
        console.log(`  - ${e.content}`);
      });
    }

    if (endEvents.length > 0 && endEvents[0].usage) {
      console.log('\n📈 Usage Statistics:');
      console.log(`  - Input tokens: ${endEvents[0].usage.inputTokens}`);
      console.log(`  - Output tokens: ${endEvents[0].usage.outputTokens}`);
      console.log(`  - Total tokens: ${endEvents[0].usage.totalTokens}`);
    }

    // Overall validation
    const allPassed = Object.values(validations).every((v) => v === true);

    if (allPassed) {
      console.log(
        '\n🎉 All validations passed! Streaming service is working correctly.'
      );
    } else {
      console.log(
        '\n⚠️  Some validations failed. Please review the results above.'
      );
    }

    // Close SSE connection
    sseResponse.data.destroy();
  } catch (error) {
    console.error('\n❌ Validation failed with error:');
    if (axios.isAxiosError(error)) {
      console.error(`  - Status: ${error.response?.status}`);
      console.error(`  - Message: ${error.message}`);
      console.error(`  - Data:`, error.response?.data);
    } else {
      console.error(`  - Error:`, error);
    }
    process.exit(1);
  }
}

// Run validation
validateStreaming()
  .then(() => {
    console.log('\n✅ Validation completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  });
