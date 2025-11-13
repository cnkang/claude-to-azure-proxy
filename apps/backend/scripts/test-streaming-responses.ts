/**
 * Test Azure OpenAI Streaming with Responses API
 */

import axios from 'axios';
import config from '../src/config/index.js';

async function testStreamingResponses(): Promise<void> {
  console.log('🔍 Testing Azure OpenAI Streaming with Responses API...\n');

  const models = config.AZURE_OPENAI_MODEL.split(',').map(m => m.trim());
  const testModel = models[0];

  const url = `${config.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
  console.log(`URL: ${url}`);
  console.log(`Model: ${testModel}\n`);

  const testRequest = {
    model: testModel,
    input: [
      {
        role: 'user',
        content: 'Count from 1 to 5, one number per line.',
      },
    ],
    max_output_tokens: 100,
    stream: true, // Enable streaming
  };

  console.log('Request:', JSON.stringify(testRequest, null, 2));
  console.log('\nSending streaming request...\n');

  try {
    const response = await axios.post(url, testRequest, {
      headers: {
        'api-key': config.AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
      timeout: 30000,
    });

    console.log('✅ Stream started!\n');
    console.log('Receiving chunks:\n');

    let buffer = '';
    let chunkCount = 0;

    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            console.log('\n✅ Stream completed with [DONE] marker');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            chunkCount++;
            console.log(`Chunk ${chunkCount}:`, JSON.stringify(parsed, null, 2));
          } catch (e) {
            console.log(`Raw data: ${data}`);
          }
        } else if (line.startsWith('event: ')) {
          console.log(`Event: ${line.slice(7)}`);
        }
      }
    });

    response.data.on('end', () => {
      console.log(`\n✅ Stream ended. Total chunks: ${chunkCount}`);
    });

    response.data.on('error', (error: Error) => {
      console.error('\n❌ Stream error:', error.message);
    });

    // Wait for stream to complete
    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 30000);
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('\n❌ Request failed:');
      console.error(`Status: ${error.response?.status}`);
      console.error(`Error:`, error.response?.data);
    } else {
      console.error('\n❌ Error:', error);
    }
    process.exit(1);
  }
}

testStreamingResponses()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
