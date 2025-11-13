/**
 * Direct Azure OpenAI API Test Script
 * 
 * This script makes direct axios calls to the Azure OpenAI Responses API
 * to isolate and debug the "canceled" error issue. It tests with and without
 * AbortController to identify the root cause.
 * 
 * Requirements: 9.1, 9.2, 9.3
 * Task: 4.7.4 - Test direct Azure OpenAI API calls
 */

import axios, { type AxiosResponse } from 'axios';
import { config as dotenvConfig } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenvConfig();

// Configuration
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
// Use first model from comma-separated list
const AZURE_OPENAI_MODEL = process.env.AZURE_OPENAI_MODEL?.split(',')[0].trim();
const AZURE_OPENAI_TIMEOUT = parseInt(process.env.AZURE_OPENAI_TIMEOUT || '120000', 10);

// Validate configuration
if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_MODEL) {
  console.error('ERROR: Missing required environment variables');
  console.error('Required: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_MODEL');
  process.exit(1);
}

// Test request payload
const createTestRequest = () => ({
  model: AZURE_OPENAI_MODEL,
  input: [
    {
      role: 'user',
      content: 'Write a short poem about TypeScript. Keep it under 50 words.',
    },
  ],
  max_output_tokens: 200,
  stream: true,
});

/**
 * Test 1: Direct call WITHOUT AbortController
 */
async function testWithoutAbortController(): Promise<void> {
  console.log('\n=== TEST 1: Direct Azure OpenAI Call WITHOUT AbortController ===\n');
  
  const correlationId = uuidv4();
  const requestPayload = createTestRequest();
  const endpoint = `${AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
  
  console.log('Configuration:');
  console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Model: ${AZURE_OPENAI_MODEL}`);
  console.log(`  Timeout: ${AZURE_OPENAI_TIMEOUT}ms`);
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Request: ${JSON.stringify(requestPayload, null, 2)}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] Making axios request...`);
    
    const response: AxiosResponse = await axios.post(endpoint, requestPayload, {
      headers: {
        'api-key': AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      responseType: 'stream',
      timeout: AZURE_OPENAI_TIMEOUT,
      // NO AbortController signal
    });
    
    const requestDuration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Response received (${requestDuration}ms)`);
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Content-Type: ${response.headers['content-type']}`);
    console.log(`  Transfer-Encoding: ${response.headers['transfer-encoding']}`);
    console.log('');
    
    let buffer = '';
    let chunkCount = 0;
    let contentLength = 0;
    let completed = false;
    
    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      buffer += chunk.toString();
      
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            completed = true;
            console.log(`[${new Date().toISOString()}] Stream completed with [DONE] marker`);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              contentLength += parsed.delta.length;
              process.stdout.write(parsed.delta);
            } else if (parsed.type === 'response.completed') {
              completed = true;
              console.log(`\n[${new Date().toISOString()}] Stream completed with response.completed`);
              if (parsed.response?.usage) {
                console.log(`  Usage: ${JSON.stringify(parsed.response.usage)}`);
              }
            }
          } catch (parseError) {
            console.error(`Parse error: ${parseError}`);
          }
        }
      }
    });
    
    response.data.on('error', (error: Error) => {
      console.error(`\n[${new Date().toISOString()}] Stream error: ${error.message}`);
    });
    
    response.data.on('end', () => {
      const totalDuration = Date.now() - startTime;
      console.log(`\n[${new Date().toISOString()}] Stream ended`);
      console.log(`  Total chunks: ${chunkCount}`);
      console.log(`  Content length: ${contentLength} characters`);
      console.log(`  Total duration: ${totalDuration}ms`);
      console.log(`  Completed: ${completed}`);
    });
    
    // Wait for stream to complete
    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
    
    console.log('\n✅ TEST 1 PASSED: Request completed successfully without AbortController\n');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`\n❌ TEST 1 FAILED after ${totalDuration}ms`);
    
    if (axios.isAxiosError(error)) {
      console.error(`  Error Code: ${error.code}`);
      console.error(`  Error Message: ${error.message}`);
      console.error(`  Is Canceled: ${error.code === 'ERR_CANCELED' || error.message.includes('canceled')}`);
      console.error(`  Is Timeout: ${error.code === 'ECONNABORTED' || error.message.includes('timeout')}`);
      if (error.response) {
        console.error(`  Response Status: ${error.response.status}`);
        try {
          const responseData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data, null, 2);
          console.error(`  Response Data: ${responseData}`);
        } catch {
          console.error(`  Response Data: [Unable to stringify - circular reference]`);
        }
      }
    } else if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    }
    console.log('');
  }
}

/**
 * Test 2: Direct call WITH AbortController (not aborted)
 */
async function testWithAbortController(): Promise<void> {
  console.log('\n=== TEST 2: Direct Azure OpenAI Call WITH AbortController (not aborted) ===\n');
  
  const correlationId = uuidv4();
  const requestPayload = createTestRequest();
  const endpoint = `${AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
  const abortController = new AbortController();
  
  console.log('Configuration:');
  console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Model: ${AZURE_OPENAI_MODEL}`);
  console.log(`  Timeout: ${AZURE_OPENAI_TIMEOUT}ms`);
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  AbortController: Created (not aborted)`);
  console.log('');
  
  // Add abort event listener
  abortController.signal.addEventListener('abort', () => {
    console.log(`[${new Date().toISOString()}] ⚠️  AbortController signal aborted!`);
    console.log(`  Reason: ${abortController.signal.reason || 'No reason provided'}`);
  });
  
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] Signal state before request: aborted=${abortController.signal.aborted}`);
    console.log(`[${new Date().toISOString()}] Making axios request with AbortController...`);
    
    const response: AxiosResponse = await axios.post(endpoint, requestPayload, {
      headers: {
        'api-key': AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      responseType: 'stream',
      timeout: AZURE_OPENAI_TIMEOUT,
      signal: abortController.signal, // WITH AbortController
    });
    
    const requestDuration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Response received (${requestDuration}ms)`);
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Signal state after response: aborted=${abortController.signal.aborted}`);
    console.log('');
    
    let buffer = '';
    let chunkCount = 0;
    let contentLength = 0;
    let completed = false;
    
    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      
      // Check signal state periodically
      if (chunkCount === 1 || chunkCount % 10 === 0) {
        console.log(`[${new Date().toISOString()}] Chunk ${chunkCount}: signal.aborted=${abortController.signal.aborted}`);
      }
      
      buffer += chunk.toString();
      
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            completed = true;
            console.log(`[${new Date().toISOString()}] Stream completed with [DONE] marker`);
            console.log(`  Signal state: aborted=${abortController.signal.aborted}`);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              contentLength += parsed.delta.length;
              process.stdout.write(parsed.delta);
            } else if (parsed.type === 'response.completed') {
              completed = true;
              console.log(`\n[${new Date().toISOString()}] Stream completed with response.completed`);
              console.log(`  Signal state: aborted=${abortController.signal.aborted}`);
              if (parsed.response?.usage) {
                console.log(`  Usage: ${JSON.stringify(parsed.response.usage)}`);
              }
            }
          } catch (parseError) {
            console.error(`Parse error: ${parseError}`);
          }
        }
      }
    });
    
    response.data.on('error', (error: Error) => {
      console.error(`\n[${new Date().toISOString()}] Stream error: ${error.message}`);
      console.error(`  Signal state: aborted=${abortController.signal.aborted}`);
    });
    
    response.data.on('end', () => {
      const totalDuration = Date.now() - startTime;
      console.log(`\n[${new Date().toISOString()}] Stream ended`);
      console.log(`  Total chunks: ${chunkCount}`);
      console.log(`  Content length: ${contentLength} characters`);
      console.log(`  Total duration: ${totalDuration}ms`);
      console.log(`  Completed: ${completed}`);
      console.log(`  Signal state: aborted=${abortController.signal.aborted}`);
    });
    
    // Wait for stream to complete
    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
    
    console.log('\n✅ TEST 2 PASSED: Request completed successfully with AbortController\n');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`\n❌ TEST 2 FAILED after ${totalDuration}ms`);
    console.error(`  Signal state at error: aborted=${abortController.signal.aborted}`);
    console.error(`  Signal reason: ${abortController.signal.reason || 'No reason'}`);
    
    if (axios.isAxiosError(error)) {
      console.error(`  Error Code: ${error.code}`);
      console.error(`  Error Message: ${error.message}`);
      console.error(`  Is Canceled: ${error.code === 'ERR_CANCELED' || error.message.includes('canceled')}`);
      console.error(`  Is Timeout: ${error.code === 'ECONNABORTED' || error.message.includes('timeout')}`);
      if (error.response) {
        console.error(`  Response Status: ${error.response.status}`);
        try {
          const responseData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data, null, 2);
          console.error(`  Response Data: ${responseData}`);
        } catch {
          console.error(`  Response Data: [Unable to stringify - circular reference]`);
        }
      }
    } else if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    }
    console.log('');
  }
}

/**
 * Test 3: Direct call with minimal configuration
 */
async function testMinimalConfiguration(): Promise<void> {
  console.log('\n=== TEST 3: Minimal Configuration Test ===\n');
  
  const correlationId = uuidv4();
  const endpoint = `${AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
  
  // Minimal request - only required fields
  const minimalRequest = {
    model: AZURE_OPENAI_MODEL,
    input: [
      {
        role: 'user',
        content: 'Say "Hello World" and nothing else.',
      },
    ],
    max_output_tokens: 50,
    stream: true,
  };
  
  console.log('Configuration:');
  console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Model: ${AZURE_OPENAI_MODEL}`);
  console.log(`  Timeout: NONE (no timeout configured)`);
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Request: ${JSON.stringify(minimalRequest, null, 2)}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] Making minimal axios request...`);
    
    const response: AxiosResponse = await axios.post(endpoint, minimalRequest, {
      headers: {
        'api-key': AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      responseType: 'stream',
      // NO timeout, NO AbortController - absolute minimal config
    });
    
    const requestDuration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Response received (${requestDuration}ms)`);
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log('');
    
    let buffer = '';
    let chunkCount = 0;
    let completed = false;
    
    response.data.on('data', (chunk: Buffer) => {
      chunkCount++;
      buffer += chunk.toString();
      
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            completed = true;
            console.log(`[${new Date().toISOString()}] Stream completed with [DONE]`);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              process.stdout.write(parsed.delta);
            } else if (parsed.type === 'response.completed') {
              completed = true;
              console.log(`\n[${new Date().toISOString()}] Stream completed`);
            }
          } catch (parseError) {
            // Ignore parse errors in minimal test
          }
        }
      }
    });
    
    response.data.on('error', (error: Error) => {
      console.error(`\n[${new Date().toISOString()}] Stream error: ${error.message}`);
    });
    
    response.data.on('end', () => {
      const totalDuration = Date.now() - startTime;
      console.log(`\n[${new Date().toISOString()}] Stream ended`);
      console.log(`  Total chunks: ${chunkCount}`);
      console.log(`  Total duration: ${totalDuration}ms`);
      console.log(`  Completed: ${completed}`);
    });
    
    // Wait for stream to complete
    await new Promise<void>((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
    
    console.log('\n✅ TEST 3 PASSED: Minimal configuration request completed successfully\n');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`\n❌ TEST 3 FAILED after ${totalDuration}ms`);
    
    if (axios.isAxiosError(error)) {
      console.error(`  Error Code: ${error.code}`);
      console.error(`  Error Message: ${error.message}`);
      console.error(`  Is Canceled: ${error.code === 'ERR_CANCELED' || error.message.includes('canceled')}`);
    } else if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
    }
    console.log('');
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Direct Azure OpenAI API Test Script                          ║');
  console.log('║  Task 4.7.4: Test direct Azure OpenAI API calls               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('This script tests direct axios calls to Azure OpenAI Responses API');
  console.log('to isolate the "canceled" error and compare behavior with/without');
  console.log('AbortController.');
  console.log('');
  
  try {
    // Run all tests sequentially
    await testWithoutAbortController();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
    
    await testWithAbortController();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
    
    await testMinimalConfiguration();
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  All Tests Completed                                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Summary:');
    console.log('  - Test 1: Direct call WITHOUT AbortController');
    console.log('  - Test 2: Direct call WITH AbortController (not aborted)');
    console.log('  - Test 3: Minimal configuration (no timeout, no AbortController)');
    console.log('');
    console.log('Review the output above to identify any differences in behavior.');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Test suite failed with unexpected error:');
    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

// Run the tests
main().catch((error) => {
  console.error('Fatal error:');
  if (error instanceof Error) {
    console.error(`  ${error.message}`);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
