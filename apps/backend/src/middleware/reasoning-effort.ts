/**
 * Reasoning effort analysis middleware for intelligent reasoning effort determination
 * Analyzes request complexity and adds reasoning recommendations to request object
 */

import type { Request, Response, NextFunction } from 'express';
import type {
  RequestWithCorrelationId,
  ClaudeRequest,
  ReasoningEffort,
  ComplexityFactors,
  LanguageContext,
} from '../types/index';
import { logger } from './logging';
import { ReasoningEffortAnalysisService } from '../utils/reasoning-effort-analyzer';
import { conversationManager } from '../utils/conversation-manager';

/**
 * Extended request interface with reasoning effort analysis information
 */
export interface RequestWithReasoningAnalysis extends RequestWithCorrelationId {
  readonly reasoningEffort?: ReasoningEffort;
  readonly complexityFactors: ComplexityFactors;
  readonly languageContext: LanguageContext;
  readonly reasoningAnalysisTime: number;
  readonly shouldApplyReasoning: boolean;
  readonly conversationComplexity: 'simple' | 'medium' | 'complex';
}

/**
 * Reasoning effort analysis middleware that analyzes request complexity
 * and determines optimal reasoning effort levels
 */
export const reasoningEffortMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId =
    (req as RequestWithCorrelationId).correlationId || 'unknown';

  try {
    // Initialize reasoning analyzer
    const reasoningAnalyzer = new ReasoningEffortAnalysisService();

    // Extract conversation ID for context analysis
    const conversationId = conversationManager.extractConversationId(
      req.headers as Record<string, string>,
      correlationId
    );

    // Get conversation context
    const conversationContext =
      conversationManager.getConversationContext(conversationId);

    // Analyze request if it's a Claude request format
    let reasoningEffort: ReasoningEffort | undefined;
    let complexityFactors: ComplexityFactors;
    let languageContext: LanguageContext;
    let shouldApplyReasoning = false;
    let conversationComplexity: 'simple' | 'medium' | 'complex' = 'simple';

    // Check if request body looks like a Claude request
    if (isClaudeRequest(req.body)) {
      const claudeRequest = req.body as ClaudeRequest;

      // Analyze reasoning effort
      reasoningEffort = reasoningAnalyzer.analyzeRequest(
        claudeRequest,
        conversationContext
      );

      // Get detailed complexity analysis
      complexityFactors =
        reasoningAnalyzer.detectComplexityFactors(claudeRequest);
      languageContext = reasoningAnalyzer.detectLanguageContext(claudeRequest);
      shouldApplyReasoning =
        reasoningAnalyzer.shouldApplyReasoning(claudeRequest);

      // Analyze conversation complexity if we have conversation context
      if (conversationContext) {
        conversationComplexity = conversationManager.analyzeConversationContext(
          conversationId,
          claudeRequest
        );
      }
    } else {
      // For non-Claude requests, provide default values
      complexityFactors = {
        contentLength: JSON.stringify(req.body).length,
        messageCount: 1,
        codeBlockCount: 0,
        languageContext: {
          primaryLanguage: 'unknown',
          frameworks: [],
          complexity: 'simple',
          developmentType: 'completion',
        },
        hasArchitecturalKeywords: false,
        hasAlgorithmicKeywords: false,
        hasDebuggingKeywords: false,
        isSimpleCompletion: true,
        conversationDepth: 1,
        hasMultipleLanguages: false,
        hasComplexFrameworkPatterns: false,
      };

      languageContext = complexityFactors.languageContext;
    }

    const reasoningAnalysisTime = Date.now() - startTime;

    // Add reasoning analysis information to request object
    const requestWithReasoning = req as unknown as RequestWithReasoningAnalysis;
    if (reasoningEffort) {
      (
        requestWithReasoning as { reasoningEffort?: ReasoningEffort }
      ).reasoningEffort = reasoningEffort;
    }
    (
      requestWithReasoning as { complexityFactors: ComplexityFactors }
    ).complexityFactors = complexityFactors;
    (
      requestWithReasoning as { languageContext: LanguageContext }
    ).languageContext = languageContext;
    (
      requestWithReasoning as { reasoningAnalysisTime: number }
    ).reasoningAnalysisTime = reasoningAnalysisTime;
    (
      requestWithReasoning as { shouldApplyReasoning: boolean }
    ).shouldApplyReasoning = shouldApplyReasoning;
    (
      requestWithReasoning as {
        conversationComplexity: 'simple' | 'medium' | 'complex';
      }
    ).conversationComplexity = conversationComplexity;

    logger.debug('Reasoning effort analysis completed', correlationId, {
      reasoningEffort,
      shouldApplyReasoning,
      conversationComplexity,
      primaryLanguage: languageContext.primaryLanguage,
      taskComplexity: languageContext.complexity,
      developmentType: languageContext.developmentType,
      contentLength: complexityFactors.contentLength,
      codeBlockCount: complexityFactors.codeBlockCount,
      reasoningAnalysisTime,
      conversationId,
    });

    next();
  } catch (error) {
    const reasoningAnalysisTime = Date.now() - startTime;

    logger.error('Reasoning effort analysis failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      reasoningAnalysisTime,
      path: req.path,
      method: req.method,
    });

    // Provide default values on error
    const requestWithReasoning = req as unknown as RequestWithReasoningAnalysis;
    // reasoningEffort will remain undefined (optional field)
    (
      requestWithReasoning as { complexityFactors: ComplexityFactors }
    ).complexityFactors = {
      contentLength: 0,
      messageCount: 1,
      codeBlockCount: 0,
      languageContext: {
        primaryLanguage: 'unknown',
        frameworks: [],
        complexity: 'simple',
        developmentType: 'completion',
      },
      hasArchitecturalKeywords: false,
      hasAlgorithmicKeywords: false,
      hasDebuggingKeywords: false,
      isSimpleCompletion: true,
      conversationDepth: 1,
      hasMultipleLanguages: false,
      hasComplexFrameworkPatterns: false,
    };
    (
      requestWithReasoning as { languageContext: LanguageContext }
    ).languageContext = {
      primaryLanguage: 'unknown',
      frameworks: [],
      complexity: 'simple',
      developmentType: 'completion',
    };
    (
      requestWithReasoning as { reasoningAnalysisTime: number }
    ).reasoningAnalysisTime = reasoningAnalysisTime;
    (
      requestWithReasoning as { shouldApplyReasoning: boolean }
    ).shouldApplyReasoning = false;
    (
      requestWithReasoning as {
        conversationComplexity: 'simple' | 'medium' | 'complex';
      }
    ).conversationComplexity = 'simple';

    next();
  }
};

/**
 * Type guard to check if request has reasoning analysis information
 */
export function hasReasoningAnalysis(
  req: Request
): req is RequestWithReasoningAnalysis {
  const requestWithReasoning = req as RequestWithReasoningAnalysis;
  return (
    typeof requestWithReasoning.reasoningAnalysisTime === 'number' &&
    typeof requestWithReasoning.shouldApplyReasoning === 'boolean' &&
    typeof requestWithReasoning.conversationComplexity === 'string' &&
    typeof requestWithReasoning.complexityFactors === 'object' &&
    typeof requestWithReasoning.languageContext === 'object'
  );
}

/**
 * Simple type guard to check if request body looks like a Claude request
 */
function isClaudeRequest(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const requestBody = body as Record<string, unknown>;

  // Check for Claude-specific indicators
  return (
    'messages' in requestBody &&
    Array.isArray(requestBody.messages) &&
    ('system' in requestBody ||
      'max_tokens' in requestBody ||
      'anthropic-version' in requestBody ||
      hasClaudeContentBlocks(requestBody.messages))
  );
}

/**
 * Check if messages contain Claude-style content blocks
 */
function hasClaudeContentBlocks(messages: unknown[]): boolean {
  return messages.some((message) => {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const messageObj = message as Record<string, unknown>;
    if (!('content' in messageObj)) {
      return false;
    }

    const { content } = messageObj;
    return (
      Array.isArray(content) &&
      content.some(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          typeof (block as Record<string, unknown>).type === 'string'
      )
    );
  });
}
