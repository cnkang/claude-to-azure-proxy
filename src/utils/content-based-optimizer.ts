/**
 * Content-based optimization service for reasoning effort analysis
 * Provides enhanced detection and reasoning adjustments for different development scenarios
 * Supports multi-language development task detection and framework-specific optimizations
 */

import type {
  ClaudeRequest,
  ClaudeMessage,
  ClaudeContentBlock,
  ConversationContext,
  ReasoningEffort,
  ComplexityFactors,
  LanguageContext,
  Framework,
} from '../types/index.js';

import {
  ReasoningEffortAnalysisService,
  LanguageDetectionService,
  ComplexityAnalysisService,
  type ReasoningEffortAnalyzer,
  type LanguageDetector,
  type ComplexityAnalyzer,
} from './reasoning-effort-analyzer.js';

/**
 * Interface for content-based optimization
 */
type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;

export interface ContentBasedOptimizer {
  /**
   * Optimize reasoning effort based on content analysis
   * @param request - The Claude request to analyze
   * @param baseEffort - Base reasoning effort from standard analysis
   * @returns Optimized reasoning effort or undefined
   */
  optimizeReasoningEffort(
    request: DeepReadonly<ClaudeRequest>,
    baseEffort?: ReasoningEffort
  ): ReasoningEffort | undefined;

  /**
   * Detect if request is a simple completion that should use fast-path
   * @param request - The Claude request to analyze
   * @returns True if fast-path should be used
   */
  shouldUseFastPath(request: DeepReadonly<ClaudeRequest>): boolean;

  /**
   * Detect development task type and adjust reasoning accordingly
   * @param request - The Claude request to analyze
   * @returns Adjusted reasoning effort or undefined
   */
  adjustForDevelopmentTask(
    request: DeepReadonly<ClaudeRequest>
  ): ReasoningEffort | undefined;

  /**
   * Apply language-specific optimizations
   * @param request - The Claude request to analyze
   * @param languageContext - Detected language context
   * @returns Language-optimized reasoning effort or undefined
   */
  applyLanguageOptimizations(
    request: DeepReadonly<ClaudeRequest>,
    languageContext: DeepReadonly<LanguageContext>
  ): ReasoningEffort | undefined;

  /**
   * Apply framework-specific optimizations
   * @param request - The Claude request to analyze
   * @param frameworks - Detected frameworks
   * @returns Framework-optimized reasoning effort or undefined
   */
  applyFrameworkOptimizations(
    request: DeepReadonly<ClaudeRequest>,
    frameworks: ReadonlyArray<Framework>
  ): ReasoningEffort | undefined;

  /**
   * Detect DevOps and infrastructure-as-code tasks
   * @param request - The Claude request to analyze
   * @returns True if DevOps task detected
   */
  isDevOpsTask(request: DeepReadonly<ClaudeRequest>): boolean;
}

/**
 * Development task patterns for enhanced detection
 */
export const DEVELOPMENT_TASK_PATTERNS = {
  // Code completion patterns (should use fast-path)
  simpleCompletion: [
    'complete this function',
    'finish this code',
    'add the missing',
    'fill in the',
    'what comes next',
    'continue from here',
    'auto complete',
    'code completion',
  ],

  // Explanation vs implementation patterns
  explanation: [
    'explain how',
    'what does this do',
    'how does this work',
    'can you explain',
    'what is the purpose',
    'describe the',
    'walk me through',
    'help me understand',
  ],

  implementation: [
    'implement',
    'create a',
    'build a',
    'write a',
    'develop a',
    'make a',
    'code a',
    'program a',
  ],

  // DevOps and infrastructure patterns
  devops: [
    'docker',
    'kubernetes',
    'terraform',
    'ansible',
    'jenkins',
    'gitlab-ci',
    'github actions',
    'deployment',
    'infrastructure',
    'ci/cd',
    'pipeline',
    'containerization',
    'orchestration',
    'monitoring',
    'logging',
    'metrics',
  ],

  // Multi-language project indicators
  multiLanguage: [
    'full stack',
    'frontend and backend',
    'microservices',
    'polyglot',
    'multiple languages',
    'different technologies',
    'tech stack',
    'architecture',
  ],

  // Complex architectural patterns
  architecture: [
    'system design',
    'architecture',
    'design pattern',
    'scalability',
    'performance',
    'distributed system',
    'microservices',
    'event driven',
    'message queue',
    'load balancing',
    'caching strategy',
    'database design',
    'api design',
    'security architecture',
  ],
} as const;

/**
 * Language-specific optimization configurations
 */
export const LANGUAGE_OPTIMIZATIONS = {
  python: {
    complexityBoost: 0.2,
    frameworkKeywords: [
      'django',
      'flask',
      'fastapi',
      'pandas',
      'numpy',
      'tensorflow',
    ],
    architecturalPatterns: [
      'models.py',
      'views.py',
      'settings.py',
      'serializers.py',
    ],
    simplePatterns: ['print(', 'def ', 'import '],
    shouldTriggerReasoning: true,
  },
  java: {
    complexityBoost: 0.3,
    frameworkKeywords: ['spring', 'hibernate', 'maven', 'gradle', 'junit'],
    architecturalPatterns: [
      '@RestController',
      '@Service',
      '@Repository',
      '@Entity',
    ],
    simplePatterns: ['System.out.println', 'public class'],
    shouldTriggerReasoning: true,
  },
  kotlin: {
    complexityBoost: 0.3,
    frameworkKeywords: [
      'android',
      'jetpack compose',
      'coroutines',
      'room',
      'retrofit',
    ],
    architecturalPatterns: ['Activity', 'Fragment', 'ViewModel', 'Repository'],
    simplePatterns: ['fun main', 'println', 'data class'],
    shouldTriggerReasoning: true,
  },
  typescript: {
    complexityBoost: 0.25,
    frameworkKeywords: ['react', 'vue', 'angular', 'next.js', 'nest.js'],
    architecturalPatterns: ['component', 'service', 'module', 'decorator'],
    simplePatterns: ['console.log', 'function ', 'const '],
    shouldTriggerReasoning: true,
  },
  javascript: {
    complexityBoost: 0.2,
    frameworkKeywords: ['react', 'vue', 'node.js', 'express'],
    architecturalPatterns: ['component', 'module', 'middleware'],
    simplePatterns: ['console.log', 'function', 'const'],
    shouldTriggerReasoning: false, // TypeScript preferred
  },
  shell: {
    complexityBoost: 0.4,
    frameworkKeywords: ['docker', 'kubernetes', 'terraform', 'ansible'],
    architecturalPatterns: ['Dockerfile', 'docker-compose', 'pipeline'],
    simplePatterns: ['echo', 'ls', 'cd'],
    shouldTriggerReasoning: true,
  },
  swift: {
    complexityBoost: 0.3,
    frameworkKeywords: ['swiftui', 'uikit', 'core data', 'combine'],
    architecturalPatterns: ['ViewController', 'ViewModel', 'Coordinator'],
    simplePatterns: ['print(', 'func ', 'var '],
    shouldTriggerReasoning: true,
  },
} as const;

const LANGUAGE_OPTIMIZATIONS_MAP = new Map(
  Object.entries(LANGUAGE_OPTIMIZATIONS) as ReadonlyArray<
    [
      keyof typeof LANGUAGE_OPTIMIZATIONS,
      (typeof LANGUAGE_OPTIMIZATIONS)[keyof typeof LANGUAGE_OPTIMIZATIONS],
    ]
  >
);

/**
 * Framework-specific optimization configurations
 */
export const FRAMEWORK_OPTIMIZATIONS = {
  django: {
    complexityBoost: 0.3,
    reasoningThreshold: 500,
    architecturalKeywords: [
      'models',
      'views',
      'serializers',
      'middleware',
      'signals',
    ],
  },
  'spring-boot': {
    complexityBoost: 0.4,
    reasoningThreshold: 600,
    architecturalKeywords: [
      'controller',
      'service',
      'repository',
      'configuration',
    ],
  },
  'spring-cloud': {
    complexityBoost: 0.5,
    reasoningThreshold: 400,
    architecturalKeywords: [
      'microservices',
      'eureka',
      'zuul',
      'hystrix',
      'config',
    ],
  },
  react: {
    complexityBoost: 0.3,
    reasoningThreshold: 400,
    architecturalKeywords: ['component', 'hooks', 'context', 'redux', 'state'],
  },
  vue: {
    complexityBoost: 0.3,
    reasoningThreshold: 400,
    architecturalKeywords: ['component', 'composition api', 'vuex', 'router'],
  },
  'android-sdk': {
    complexityBoost: 0.4,
    reasoningThreshold: 500,
    architecturalKeywords: [
      'activity',
      'fragment',
      'service',
      'broadcast',
      'content provider',
    ],
  },
  fastapi: {
    complexityBoost: 0.25,
    reasoningThreshold: 300,
    architecturalKeywords: ['pydantic', 'dependency injection', 'middleware'],
  },
} as const;

const FRAMEWORK_OPTIMIZATIONS_MAP = new Map(
  Object.entries(FRAMEWORK_OPTIMIZATIONS) as ReadonlyArray<
    [
      keyof typeof FRAMEWORK_OPTIMIZATIONS,
      (typeof FRAMEWORK_OPTIMIZATIONS)[keyof typeof FRAMEWORK_OPTIMIZATIONS],
    ]
  >
);

/**
 * Content-based optimizer implementation
 */
export class ContentBasedOptimizerService implements ContentBasedOptimizer {
  private readonly baseAnalyzer: ReasoningEffortAnalyzer;
  private readonly languageDetector: LanguageDetector;
  private readonly complexityAnalyzer: ComplexityAnalyzer;

  constructor(
    baseAnalyzer?: ReasoningEffortAnalyzer,
    languageDetector?: LanguageDetector,
    complexityAnalyzer?: ComplexityAnalyzer
  ) {
    this.baseAnalyzer = baseAnalyzer ?? new ReasoningEffortAnalysisService();
    this.languageDetector = languageDetector ?? new LanguageDetectionService();
    this.complexityAnalyzer =
      complexityAnalyzer ?? new ComplexityAnalysisService();
  }

  /**
   * Optimize reasoning effort based on content analysis
   */
  public optimizeReasoningEffort(
    request: DeepReadonly<ClaudeRequest>,
    baseEffort?: ReasoningEffort
  ): ReasoningEffort | undefined {
    // Fast-path for simple completions
    if (this.shouldUseFastPath(request)) {
      return undefined; // No reasoning needed
    }

    // Get base effort if not provided
    const effort = baseEffort ?? this.baseAnalyzer.analyzeRequest(request);

    // Apply development task optimizations
    const taskOptimized = this.adjustForDevelopmentTask(request);
    if (taskOptimized !== undefined) {
      return this.combineEfforts(effort, taskOptimized);
    }

    // Apply language-specific optimizations
    const languageContext = this.baseAnalyzer.detectLanguageContext(request);
    const languageOptimized = this.applyLanguageOptimizations(
      request,
      languageContext
    );
    if (languageOptimized !== undefined) {
      return this.combineEfforts(effort, languageOptimized);
    }

    // Apply framework-specific optimizations
    const frameworkOptimized = this.applyFrameworkOptimizations(
      request,
      languageContext.frameworks
    );
    if (frameworkOptimized !== undefined) {
      return this.combineEfforts(effort, frameworkOptimized);
    }

    return effort;
  }

  /**
   * Detect if request is a simple completion that should use fast-path
   */
  public shouldUseFastPath(request: DeepReadonly<ClaudeRequest>): boolean {
    const content = this.extractAllContent(request);
    const normalizedContent = content.toLowerCase();

    // Check for simple completion patterns
    const isSimpleCompletion = DEVELOPMENT_TASK_PATTERNS.simpleCompletion.some(
      (pattern) => normalizedContent.includes(pattern)
    );

    // Check content length (very short requests are likely simple)
    const isShortContent = content.length < 100;

    // Check for explanation requests (don't need reasoning for explanations)
    const isExplanation = DEVELOPMENT_TASK_PATTERNS.explanation.some(
      (pattern) => normalizedContent.includes(pattern)
    );

    return (
      isSimpleCompletion ||
      (isShortContent && !this.hasComplexPatterns(normalizedContent)) ||
      isExplanation
    );
  }

  /**
   * Detect development task type and adjust reasoning accordingly
   */
  public adjustForDevelopmentTask(
    request: DeepReadonly<ClaudeRequest>
  ): ReasoningEffort | undefined {
    const content = this.extractAllContent(request).toLowerCase();

    // DevOps tasks need enhanced reasoning
    if (this.isDevOpsTask(request)) {
      return 'high';
    }

    // Architectural tasks need high reasoning
    if (
      DEVELOPMENT_TASK_PATTERNS.architecture.some((pattern) =>
        content.includes(pattern)
      )
    ) {
      return 'high';
    }

    // Multi-language projects need medium reasoning
    if (
      DEVELOPMENT_TASK_PATTERNS.multiLanguage.some((pattern) =>
        content.includes(pattern)
      )
    ) {
      return 'medium';
    }

    // Implementation tasks need at least low reasoning
    if (
      DEVELOPMENT_TASK_PATTERNS.implementation.some((pattern) =>
        content.includes(pattern)
      )
    ) {
      return 'low';
    }

    return undefined;
  }

  /**
   * Apply language-specific optimizations
   */
  public applyLanguageOptimizations(
    request: DeepReadonly<ClaudeRequest>,
    languageContext: DeepReadonly<LanguageContext>
  ): ReasoningEffort | undefined {
    const { primaryLanguage } = languageContext;
    const content = this.extractAllContent(request);

    const langConfig = this.getLanguageOptimization(primaryLanguage);
    if (langConfig === undefined) {
      return undefined;
    }

    // Skip reasoning for languages that don't benefit from it
    if (!langConfig.shouldTriggerReasoning) {
      return undefined;
    }

    // Check for framework keywords
    const normalizedContent = content.toLowerCase();
    const hasFrameworkKeywords = langConfig.frameworkKeywords.some((keyword) =>
      normalizedContent.includes(keyword)
    );

    // Check for architectural patterns
    const hasArchitecturalPatterns = langConfig.architecturalPatterns.some(
      (pattern) => normalizedContent.includes(pattern)
    );

    // Check for simple patterns (should reduce reasoning)
    const hasSimplePatterns = langConfig.simplePatterns.some((pattern) =>
      normalizedContent.includes(pattern)
    );

    // Determine reasoning level based on patterns
    if (hasArchitecturalPatterns || hasFrameworkKeywords) {
      return content.length > 1000 ? 'high' : 'medium';
    }

    if (hasSimplePatterns && content.length < 200) {
      return 'low'; // Changed from 'minimal' to 'low' for gpt-5-codex compatibility
    }

    // Apply complexity boost for this language
    if (content.length > 500) {
      return 'low';
    }

    return undefined;
  }

  /**
   * Apply framework-specific optimizations
   */
  public applyFrameworkOptimizations(
    request: DeepReadonly<ClaudeRequest>,
    frameworks: ReadonlyArray<Framework>
  ): ReasoningEffort | undefined {
    if (frameworks.length === 0) {
      return undefined;
    }

    const content = this.extractAllContent(request);
    const normalizedContent = content.toLowerCase();
    let maxReasoningLevel: ReasoningEffort | undefined;

    for (const framework of frameworks) {
      const frameworkConfig = this.getFrameworkOptimization(framework);
      if (frameworkConfig === undefined) {
        continue;
      }

      // Check if content meets reasoning threshold
      if (content.length < frameworkConfig.reasoningThreshold) {
        continue;
      }

      // Check for architectural keywords
      const hasArchitecturalKeywords =
        frameworkConfig.architecturalKeywords.some((keyword) =>
          normalizedContent.includes(keyword)
        );

      if (hasArchitecturalKeywords) {
        // Determine reasoning level based on complexity boost and content length
        let reasoningLevel: ReasoningEffort;
        if (content.length > 2000) {
          reasoningLevel = 'high';
        } else if (content.length > 1000) {
          reasoningLevel = 'medium';
        } else {
          reasoningLevel = 'low';
        }

        // Keep the highest reasoning level
        if (
          maxReasoningLevel === undefined ||
          this.compareReasoningLevels(reasoningLevel, maxReasoningLevel) > 0
        ) {
          maxReasoningLevel = reasoningLevel;
        }
      }
    }

    return maxReasoningLevel;
  }

  /**
   * Detect DevOps and infrastructure-as-code tasks
   */
  public isDevOpsTask(request: DeepReadonly<ClaudeRequest>): boolean {
    const content = this.extractAllContent(request).toLowerCase();
    return DEVELOPMENT_TASK_PATTERNS.devops.some((pattern) =>
      content.includes(pattern)
    );
  }

  /**
   * Extract all content from request messages
   */
  private extractAllContent(request: DeepReadonly<ClaudeRequest>): string {
    const contents: string[] = [];

    if (typeof request.system === 'string' && request.system.length > 0) {
      contents.push(request.system);
    }

    for (const message of request.messages) {
      contents.push(this.extractMessageContent(message));
    }

    return contents.join('\n');
  }

  /**
   * Extract text content from a message
   */
  private extractMessageContent(message: DeepReadonly<ClaudeMessage>): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const textSegments: string[] = [];
      for (const block of message.content as readonly ClaudeContentBlock[]) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textSegments.push(block.text);
        }
      }
      return textSegments.join('\n');
    }

    return '';
  }

  /**
   * Check if content has complex patterns that require reasoning
   */
  private hasComplexPatterns(content: string): boolean {
    const complexPatterns = [
      'algorithm',
      'optimization',
      'architecture',
      'design pattern',
      'performance',
      'scalability',
      'security',
      'database',
      'api',
      'microservice',
    ];

    return complexPatterns.some((pattern) => content.includes(pattern));
  }

  private getLanguageOptimization(
    language: LanguageContext['primaryLanguage']
  ) {
    const key = language as keyof typeof LANGUAGE_OPTIMIZATIONS;
    return LANGUAGE_OPTIMIZATIONS_MAP.get(key);
  }

  private getFrameworkOptimization(framework: Framework) {
    const key = framework as keyof typeof FRAMEWORK_OPTIMIZATIONS;
    return FRAMEWORK_OPTIMIZATIONS_MAP.get(key);
  }

  /**
   * Combine two reasoning efforts, taking the higher level
   */
  private combineEfforts(
    effort1: ReasoningEffort | undefined,
    effort2: ReasoningEffort | undefined
  ): ReasoningEffort | undefined {
    if (effort1 === undefined) {
      return effort2;
    }

    if (effort2 === undefined) {
      return effort1;
    }

    return this.compareReasoningLevels(effort1, effort2) >= 0
      ? effort1
      : effort2;
  }

  /**
   * Compare reasoning levels (higher number = more reasoning)
   */
  private compareReasoningLevels(
    level1: ReasoningEffort,
    level2: ReasoningEffort
  ): number {
    return (
      this.getReasoningLevelValue(level1) - this.getReasoningLevelValue(level2)
    );
  }

  private getReasoningLevelValue(level: ReasoningEffort): number {
    switch (level) {
      case 'minimal':
        return 1; // Keep for backward compatibility, but map to 'low' in practice
      case 'low':
        return 2;
      case 'medium':
        return 3;
      case 'high':
        return 4;
      default:
        return 0;
    }
  }
}

/**
 * Enhanced reasoning effort analyzer with content-based optimizations
 */
export class EnhancedReasoningEffortAnalyzer
  implements ReasoningEffortAnalyzer
{
  private readonly baseAnalyzer: ReasoningEffortAnalyzer;
  private readonly optimizer: ContentBasedOptimizer;

  constructor(
    baseAnalyzer?: ReasoningEffortAnalyzer,
    optimizer?: ContentBasedOptimizer
  ) {
    this.baseAnalyzer = baseAnalyzer ?? new ReasoningEffortAnalysisService();
    this.optimizer =
      optimizer ?? new ContentBasedOptimizerService(this.baseAnalyzer);
  }

  /**
   * Analyze request with content-based optimizations
   */
  public analyzeRequest(
    request: DeepReadonly<ClaudeRequest>,
    context?: DeepReadonly<ConversationContext>
  ): ReasoningEffort | undefined {
    // Get base analysis
    const baseEffort = this.baseAnalyzer.analyzeRequest(request, context);

    // Apply content-based optimizations
    return this.optimizer.optimizeReasoningEffort(request, baseEffort);
  }

  /**
   * Check if reasoning should be applied (with optimizations)
   */
  public shouldApplyReasoning(request: DeepReadonly<ClaudeRequest>): boolean {
    // Fast-path check first
    if (this.optimizer.shouldUseFastPath(request)) {
      return false;
    }

    return this.baseAnalyzer.shouldApplyReasoning(request);
  }

  /**
   * Delegate to base analyzer
   */
  public detectComplexityFactors(
    request: DeepReadonly<ClaudeRequest>
  ): ComplexityFactors {
    return this.baseAnalyzer.detectComplexityFactors(request);
  }

  /**
   * Delegate to base analyzer
   */
  public adjustEffortBasedOnContext(
    context: DeepReadonly<ConversationContext>,
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort | undefined {
    return this.baseAnalyzer.adjustEffortBasedOnContext(context, factors);
  }

  /**
   * Delegate to base analyzer
   */
  public detectLanguageContext(
    request: DeepReadonly<ClaudeRequest>
  ): LanguageContext {
    return this.baseAnalyzer.detectLanguageContext(request);
  }
}

/**
 * Factory function to create enhanced reasoning effort analyzer
 * @returns A new enhanced reasoning effort analyzer instance
 */
export function createEnhancedReasoningEffortAnalyzer(): EnhancedReasoningEffortAnalyzer {
  return new EnhancedReasoningEffortAnalyzer();
}

/**
 * Factory function to create content-based optimizer
 * @returns A new content-based optimizer instance
 */
export function createContentBasedOptimizer(): ContentBasedOptimizerService {
  return new ContentBasedOptimizerService();
}

/**
 * Utility function to analyze reasoning effort with content-based optimizations
 * @param request - The Claude request to analyze
 * @param context - Optional conversation context
 * @returns Optimized reasoning effort level or undefined if no reasoning needed
 */
export function analyzeReasoningEffortWithOptimizations(
  request: DeepReadonly<ClaudeRequest>,
  context?: DeepReadonly<ConversationContext>
): ReasoningEffort | undefined {
  const analyzer = createEnhancedReasoningEffortAnalyzer();
  return analyzer.analyzeRequest(request, context);
}
