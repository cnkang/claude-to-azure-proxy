/**
 * Test Azure OpenAI Configuration
 *
 * Verifies that Azure OpenAI credentials are correctly configured
 */

import axios from 'axios';
import config from '../src/config/index.js';

async function testAzureConfig(): Promise<void> {
  console.log('🔍 Testing Azure OpenAI Configuration...\n');

  console.log('Configuration:');
  console.log('  Endpoint:', config.AZURE_OPENAI_ENDPOINT);
  console.log('  API Key:', `${config.AZURE_OPENAI_API_KEY.substring(0, 8)}...`);
  console.log('  Model:', config.AZURE_OPENAI_MODEL);

  // Parse models
  const models = config.AZURE_OPENAI_MODEL.split(',').map((m) => m.trim());
  console.log(`Available models: ${models.join(', ')}\n`);

  // Test with first model
  const testModel = models[0];
  console.log(`Testing with model: ${testModel}\n`);

  // Build URL for OpenAI v1 responses endpoint
  const url = `${config.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
  console.log(`Request URL: ${url}\n`);

  // Test request for responses endpoint
  // Responses API uses 'input' instead of 'messages'
  // and 'max_output_tokens' instead of 'max_completion_tokens'
  // min value for max_output_tokens is 16
  // Note: Some models don't support temperature parameter
  const testRequest = {
    model: testModel,
    input: [
      {
        role: 'user',
        content: 'Say "Hello" if you can hear me.',
      },
    ],
    max_output_tokens: 50,
  };

  console.log('Sending test request...\n');

  try {
    const response = await axios.post(url, testRequest, {
      headers: {
        'api-key': config.AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log('✅ Success! Azure OpenAI is responding correctly.\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ Azure OpenAI request failed:\n');
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Error Data:`, error.response?.data);
      console.error(`\nRequest Headers:`, error.config?.headers);
      console.error(`\nFull Error:`, error.message);

      if (error.response?.status === 401) {
        console.error('\n⚠️  Authentication Error (401):');
        console.error('  - Check that AZURE_OPENAI_API_KEY is correct');
        console.error('  - Verify the API key has not expired');
        console.error(
          '  - Ensure the API key has access to the specified deployment'
        );
      } else if (error.response?.status === 404) {
        console.error('\n⚠️  Not Found Error (404):');
        console.error('  - Check that AZURE_OPENAI_ENDPOINT is correct');
        console.error(
          `  - Verify deployment "${testModel}" exists in your Azure OpenAI resource`
        );
        console.error('  - Check the API version is supported');
      }
    } else {
      console.error('❌ Unexpected error:', error);
    }
    process.exit(1);
  }
}

testAzureConfig()
  .then(() => {
    console.log('\n✅ Azure OpenAI configuration test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Configuration test failed:', error);
    process.exit(1);
  });
