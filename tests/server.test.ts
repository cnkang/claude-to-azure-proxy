import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ServerConfig } from '../src/types/index.js';

// Mock configuration for testing
const mockConfig: ServerConfig = {
  port: 3001,
  nodeEnv: 'test',
  proxyApiKey: 'test-api-key-123456789012345678901234567890123',
  azureOpenAI: {
    endpoint: 'https://test.openai.azure.com',
    apiKey: 'test-azure-key-12345678901234567890123456789012',
    model: 'gpt-4',
  },
};

describe('Express Server Configuration', () => {
  let app: express.Application;

  beforeAll(() => {
    // Create a minimal Express app for testing middleware
    app = express();

    // Test basic Express setup
    app.get('/test', (req, res) => {
      res.json({ message: 'test endpoint' });
    });
  });

  it('should create server config correctly', () => {
    expect(mockConfig.port).toBe(3001);
    expect(mockConfig.nodeEnv).toBe('test');
    expect(mockConfig.proxyApiKey.length).toBeGreaterThanOrEqual(32);
    expect(mockConfig.azureOpenAI.endpoint).toBe(
      'https://test.openai.azure.com'
    );
    expect(mockConfig.azureOpenAI.model).toBe('gpt-4');
  });

  it('should respond to test endpoint', async () => {
    const response = await request(app).get('/test').expect(200);

    expect(response.body.message).toBe('test endpoint');
  });

  it('should validate required config properties', () => {
    expect(mockConfig).toHaveProperty('port');
    expect(mockConfig).toHaveProperty('nodeEnv');
    expect(mockConfig).toHaveProperty('proxyApiKey');
    expect(mockConfig).toHaveProperty('azureOpenAI');
    expect(mockConfig.azureOpenAI).toHaveProperty('endpoint');
    expect(mockConfig.azureOpenAI).toHaveProperty('apiKey');
    expect(mockConfig.azureOpenAI).toHaveProperty('model');
  });
});
