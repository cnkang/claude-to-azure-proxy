/**
 * Frontend Endpoints Integration Tests
 *
 * Tests for the new frontend API endpoints including session management,
 * conversation CRUD, chat streaming, and context management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ProxyServer, createServerConfig } from '../../src/index.js';
import config from '../../src/config/index.js';

describe('Frontend API Endpoints', () => {
  let server: ProxyServer;
  let app: any;
  let sessionId: string;

  beforeEach(async () => {
    const serverConfig = createServerConfig(config);
    server = new ProxyServer(serverConfig);
    app = server.getApp();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const response = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('fingerprint');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('correlationId');

      sessionId = response.body.sessionId;
    });

    it('should get session information', async () => {
      // First create a session
      const createResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = createResponse.body.sessionId;

      // Then get session info
      const response = await request(app)
        .get(`/api/session/${sessionId}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId', sessionId);
      expect(response.body).toHaveProperty('fingerprint');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('lastAccessed');
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('should return 404 for non-existent session', async () => {
      const fakeSessionId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app).get(`/api/session/${fakeSessionId}`).expect(404);
    });

    it('should get session statistics', async () => {
      const response = await request(app).get('/api/session-stats').expect(200);

      expect(response.body).toHaveProperty('totalSessions');
      expect(response.body).toHaveProperty('activeSessions');
      expect(response.body).toHaveProperty('recentSessions');
      expect(response.body).toHaveProperty('maxSessions');
    });
  });

  describe('Conversation Management', () => {
    beforeEach(async () => {
      // Create a session for conversation tests
      const sessionResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = sessionResponse.body.sessionId;
    });

    it('should create a new conversation', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('x-session-id', sessionId)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title', 'Test Conversation');
      expect(response.body).toHaveProperty('selectedModel', 'gpt-4');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('messageCount', 0);
    });

    it('should get conversations for session', async () => {
      // Create a conversation first
      await request(app)
        .post('/api/conversations')
        .set('x-session-id', sessionId)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      // Get conversations
      const response = await request(app)
        .get('/api/conversations')
        .set('x-session-id', sessionId)
        .expect(200);

      expect(response.body).toHaveProperty('conversations');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0]).toHaveProperty(
        'title',
        'Test Conversation'
      );
    });

    it('should require session ID for conversation operations', async () => {
      await request(app)
        .post('/api/conversations')
        .send({
          title: 'Test Conversation',
        })
        .expect(400);

      await request(app).get('/api/conversations').expect(400);
    });

    it('should get conversation statistics', async () => {
      const response = await request(app)
        .get('/api/conversation-stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalConversations');
      expect(response.body).toHaveProperty('activeConversations');
      expect(response.body).toHaveProperty('totalMessages');
      expect(response.body).toHaveProperty('totalSessions');
    });
  });

  describe('Context Management', () => {
    let conversationId: string;

    beforeEach(async () => {
      // Create a session
      const sessionResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = sessionResponse.body.sessionId;

      // Create a conversation
      const conversationResponse = await request(app)
        .post('/api/conversations')
        .set('x-session-id', sessionId)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      conversationId = conversationResponse.body.id;
    });

    it('should get context usage for conversation', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversationId}/context`)
        .set('x-session-id', sessionId)
        .expect(200);

      expect(response.body).toHaveProperty('contextUsage');
      expect(response.body).toHaveProperty('compressionHistory');
      expect(response.body).toHaveProperty('recommendations');

      expect(response.body.contextUsage).toHaveProperty('currentTokens');
      expect(response.body.contextUsage).toHaveProperty('maxTokens');
      expect(response.body.contextUsage).toHaveProperty('canExtend');
    });

    it('should extend context for supported models', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/extend-context`)
        .set('x-session-id', sessionId)
        .send({
          targetModel: 'qwen-3-coder',
          reason: 'Need more context for complex task',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('contextUsage');
      expect(response.body).toHaveProperty('extension');
    });

    it('should compress conversation context', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/compress`)
        .set('x-session-id', sessionId)
        .send({
          method: 'ai-summary',
          targetTokens: 1000,
          preserveRecent: 5,
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('compression');
      expect(response.body).toHaveProperty('contextUsage');
      expect(response.body).toHaveProperty('compressedContent');
    });

    it('should get context statistics', async () => {
      const response = await request(app).get('/api/context-stats').expect(200);

      expect(response.body).toHaveProperty('totalConversations');
      expect(response.body).toHaveProperty('highUsageConversations');
      expect(response.body).toHaveProperty('extendedConversations');
      expect(response.body).toHaveProperty('totalCompressions');
      expect(response.body).toHaveProperty('supportedModels');
    });
  });

  describe('Chat Streaming', () => {
    let conversationId: string;

    beforeEach(async () => {
      // Create a session
      const sessionResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = sessionResponse.body.sessionId;

      // Create a conversation
      const conversationResponse = await request(app)
        .post('/api/conversations')
        .set('x-session-id', sessionId)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      conversationId = conversationResponse.body.id;
    });

    it('should get active connections for session', async () => {
      const response = await request(app)
        .get('/api/chat/connections')
        .set('x-session-id', sessionId)
        .expect(200);

      expect(response.body).toHaveProperty('connections');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('maxConnections');
      expect(Array.isArray(response.body.connections)).toBe(true);
    });

    it('should get SSE statistics', async () => {
      const response = await request(app).get('/api/chat-stats').expect(200);

      expect(response.body).toHaveProperty('totalConnections');
      expect(response.body).toHaveProperty('activeConnections');
      expect(response.body).toHaveProperty('totalSessions');
      expect(response.body).toHaveProperty('maxConnectionsPerSession');
    });

    it('should require session for chat operations', async () => {
      await request(app).get('/api/chat/connections').expect(400);

      await request(app)
        .post('/api/chat/send')
        .send({
          conversationId,
          message: 'Hello',
          model: 'gpt-4',
        })
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session IDs', async () => {
      await request(app).get('/api/session/invalid-uuid').expect(400);
    });

    it('should handle invalid conversation IDs', async () => {
      // Create a session first
      const sessionResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = sessionResponse.body.sessionId;

      await request(app)
        .get('/api/conversations/invalid-uuid')
        .set('x-session-id', sessionId)
        .expect(400);
    });

    it('should handle missing required fields', async () => {
      // Create a session first
      const sessionResponse = await request(app)
        .post('/api/session')
        .send({})
        .expect(201);

      sessionId = sessionResponse.body.sessionId;

      // Missing message content
      await request(app)
        .post('/api/chat/send')
        .set('x-session-id', sessionId)
        .send({
          conversationId: '550e8400-e29b-41d4-a716-446655440000',
          model: 'gpt-4',
        })
        .expect(400);
    });
  });
});
