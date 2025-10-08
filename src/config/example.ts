/**
 * Example usage of the configuration module
 * This file demonstrates how to use the configuration in your application
 */

import config from './index.js';

// Example: Using configuration in an Express server
console.log('Starting server with configuration:');
console.log(`- Server will run on port: ${config.PORT}`);
console.log(`- Environment: ${config.NODE_ENV}`);
console.log(`- Azure OpenAI endpoint: ${config.AZURE_OPENAI_ENDPOINT}`);
console.log(`- Azure OpenAI model: ${config.AZURE_OPENAI_MODEL}`);

// Configuration is frozen, so this will throw an error in strict mode
try {
  (config as any).PORT = 9999;
} catch (error) {
  console.log('✓ Configuration is properly frozen and cannot be modified');
}

export default config;
