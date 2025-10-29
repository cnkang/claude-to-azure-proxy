/**
 * Intelligent reasoning effort analyzer for GPT-5-Codex Responses API
 * Analyzes request complexity and determines optimal reasoning effort levels
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
  ProgrammingLanguage,
  Framework,
  TaskComplexity,
  DevelopmentType,
  TaskComplexityIndicators,
  LanguageIndicators,
} from '../types/index.js';

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * Interface for reasoning effort analysis
 */
export interface ReasoningEffortAnalyzer {
  /**
   * Analyze request and determine optimal reasoning effort
   * @param request - The Claude request to analyze
   * @param context - Optional conversation context
   * @returns Reasoning effort level or undefined if no reasoning needed
   */
  analyzeRequest(
    request: DeepReadonly<ClaudeRequest>,
    context?: DeepReadonly<ConversationContext>
  ): ReasoningEffort | undefined;

  /**
   * Check if reasoning should be applied to the request
   * @param request - The Claude request to analyze
   * @returns True if reasoning should be applied
   */
  shouldApplyReasoning(request: DeepReadonly<ClaudeRequest>): boolean;

  /**
   * Detect complexity factors in the request
   * @param request - The Claude request to analyze
   * @returns Complexity factors analysis
   */
  detectComplexityFactors(
    request: DeepReadonly<ClaudeRequest>
  ): ComplexityFactors;

  /**
   * Adjust reasoning effort based on conversation context
   * @param context - Conversation context
   * @param factors - Complexity factors
   * @returns Adjusted reasoning effort or undefined
   */
  adjustEffortBasedOnContext(
    context: DeepReadonly<ConversationContext>,
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort | undefined;

  /**
   * Detect language context from request content
   * @param request - The Claude request to analyze
   * @returns Language context analysis
   */
  detectLanguageContext(request: DeepReadonly<ClaudeRequest>): LanguageContext;
}

/**
 * Language detection service for identifying programming languages and frameworks
 */
export interface LanguageDetector {
  /**
   * Detect primary programming language from content
   * @param content - Text content to analyze
   * @returns Detected programming language
   */
  detectPrimaryLanguage(content: string): ProgrammingLanguage;

  /**
   * Detect frameworks used in the content
   * @param content - Text content to analyze
   * @param language - Primary programming language
   * @returns Array of detected frameworks
   */
  detectFrameworks(
    content: string,
    language: ProgrammingLanguage
  ): readonly Framework[];

  /**
   * Analyze task complexity based on content and language
   * @param content - Text content to analyze
   * @param language - Primary programming language
   * @returns Task complexity level
   */
  analyzeTaskComplexity(
    content: string,
    language: ProgrammingLanguage
  ): TaskComplexity;

  /**
   * Determine development type from content
   * @param content - Text content to analyze
   * @returns Development type
   */
  determineDevelopmentType(content: string): DevelopmentType;
}

/**
 * Complexity analysis service for evaluating request complexity
 */
export interface ComplexityAnalyzer {
  /**
   * Analyze content complexity factors
   * @param request - The Claude request to analyze
   * @returns Complexity factors
   */
  analyzeContentComplexity(
    request: DeepReadonly<ClaudeRequest>
  ): ComplexityFactors;

  /**
   * Determine if reasoning should be used based on complexity factors
   * @param factors - Complexity factors to evaluate
   * @returns True if reasoning should be used
   */
  shouldUseReasoning(factors: DeepReadonly<ComplexityFactors>): boolean;

  /**
   * Determine reasoning level based on complexity factors
   * @param factors - Complexity factors to evaluate
   * @returns Reasoning effort level
   */
  determineReasoningLevel(
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort;

  /**
   * Analyze content length category
   * @param content - Text content to analyze
   * @returns Content length category
   */
  analyzeContentLength(content: string): 'short' | 'medium' | 'long';

  /**
   * Count code blocks in messages
   * @param messages - Array of Claude messages
   * @returns Number of code blocks found
   */
  countCodeBlocks(messages: readonly DeepReadonly<ClaudeMessage>[]): number;

  /**
   * Detect architectural patterns in content
   * @param content - Text content to analyze
   * @returns True if architectural patterns detected
   */
  detectArchitecturalPatterns(content: string): boolean;

  /**
   * Detect algorithmic complexity indicators
   * @param content - Text content to analyze
   * @returns True if algorithmic complexity detected
   */
  detectAlgorithmicComplexity(content: string): boolean;

  /**
   * Check if request is a simple completion
   * @param content - Text content to analyze
   * @returns True if simple completion detected
   */
  isSimpleCompletion(content: string): boolean;

  /**
   * Analyze conversation depth
   * @param messageCount - Number of messages in conversation
   * @returns Conversation depth category
   */
  analyzeConversationDepth(messageCount: number): 'shallow' | 'medium' | 'deep';

  /**
   * Detect multi-language context
   * @param messages - Array of Claude messages
   * @returns True if multiple languages detected
   */
  detectMultiLanguageContext(
    messages: readonly DeepReadonly<ClaudeMessage>[]
  ): boolean;

  /**
   * Analyze framework complexity
   * @param frameworks - Array of detected frameworks
   * @param content - Text content to analyze
   * @returns True if complex framework patterns detected
   */
  analyzeFrameworkComplexity(
    frameworks: readonly Framework[],
    content: string
  ): boolean;
}

/**
 * Reasoning decision engine for determining optimal reasoning effort
 */
export interface ReasoningDecisionEngine {
  /**
   * Decide reasoning effort based on complexity factors
   * @param factors - Complexity factors to evaluate
   * @returns Reasoning effort level or undefined if no reasoning needed
   */
  decideReasoningEffort(
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort | undefined;

  /**
   * Configuration thresholds and weights
   */
  readonly simpleCompletionThreshold: number;
  readonly complexityThreshold: number;
  readonly architecturalKeywordWeight: number;
  readonly algorithmicKeywordWeight: number;
  readonly frameworkComplexityWeight: number;
  readonly conversationDepthWeight: number;
}

/**
 * Task complexity indicators and patterns
 */
export const TASK_COMPLEXITY_INDICATORS: TaskComplexityIndicators = {
  algorithmKeywords: [
    'algorithm',
    'complexity',
    'optimization',
    'performance',
    'efficient',
    'sorting',
    'searching',
    'graph',
    'tree',
    'dynamic programming',
    'recursion',
    'iteration',
    'big o',
    'time complexity',
    'space complexity',
    'data structure',
    'heap',
    'stack',
    'queue',
    'hash',
    'binary search',
    'merge sort',
    'quick sort',
    'dijkstra',
    'breadth first',
    'depth first',
  ],
  architectureKeywords: [
    'architecture',
    'design pattern',
    'microservices',
    'monolith',
    'scalability',
    'distributed',
    'system design',
    'infrastructure',
    'deployment',
    'containerization',
    'kubernetes',
    'docker',
    'load balancing',
    'caching',
    'database design',
    'schema',
    'api design',
    'rest',
    'graphql',
    'event driven',
    'message queue',
    'pub/sub',
    'saga pattern',
    'cqrs',
    'event sourcing',
    'clean architecture',
  ],
  debuggingKeywords: [
    'debug',
    'error',
    'exception',
    'bug',
    'fix',
    'troubleshoot',
    'stack trace',
    'breakpoint',
    'logging',
    'monitoring',
    'profiling',
    'memory leak',
    'performance issue',
    'crash',
    'hang',
    'deadlock',
    'race condition',
    'null pointer',
    'segmentation fault',
    'timeout',
  ],
  simpleTaskKeywords: [
    'hello world',
    'basic example',
    'simple function',
    'quick fix',
    'one liner',
    'snippet',
    'template',
    'boilerplate',
    'starter',
    'tutorial',
    'getting started',
    'basic usage',
    'simple implementation',
  ],
  languageSpecific: {
    python: {
      complexityKeywords: [
        'django',
        'flask',
        'fastapi',
        'asyncio',
        'multiprocessing',
        'pandas',
        'numpy',
        'tensorflow',
        'pytorch',
        'scikit-learn',
        'celery',
        'gunicorn',
        'uwsgi',
        'sqlalchemy',
        'alembic',
      ],
      frameworkKeywords: [
        'django',
        'flask',
        'fastapi',
        'tornado',
        'bottle',
        'pyramid',
        'starlette',
        'sanic',
        'quart',
        'falcon',
      ],
      simplePatterns: ['print(', 'def ', 'import ', 'for i in', 'if __name__'],
      architecturalPatterns: [
        'settings.py',
        'models.py',
        'views.py',
        'serializers.py',
        'middleware',
        'signals',
        'migrations',
        'admin.py',
      ],
    },
    java: {
      complexityKeywords: [
        'spring boot',
        'spring cloud',
        'hibernate',
        'jpa',
        'maven',
        'gradle',
        'microservices',
        'kafka',
        'redis',
        'elasticsearch',
        'junit',
        'mockito',
        'jackson',
        'lombok',
        'actuator',
      ],
      frameworkKeywords: [
        'spring',
        'hibernate',
        'struts',
        'jsf',
        'wicket',
        'vaadin',
        'play',
        'dropwizard',
        'micronaut',
        'quarkus',
      ],
      simplePatterns: [
        'public static void main',
        'System.out.println',
        'public class',
      ],
      architecturalPatterns: [
        '@RestController',
        '@Service',
        '@Repository',
        '@Component',
        '@Configuration',
        '@Entity',
        '@Table',
        'application.properties',
      ],
    },
    kotlin: {
      complexityKeywords: [
        'android',
        'jetpack compose',
        'coroutines',
        'flow',
        'room',
        'retrofit',
        'dagger',
        'hilt',
        'navigation',
        'lifecycle',
        'viewmodel',
        'livedata',
        'databinding',
        'workmanager',
      ],
      frameworkKeywords: [
        'android',
        'ktor',
        'spring',
        'exposed',
        'koin',
        'kodein',
      ],
      simplePatterns: ['fun main', 'println', 'class ', 'data class'],
      architecturalPatterns: [
        'Activity',
        'Fragment',
        'ViewModel',
        'Repository',
        'UseCase',
        'MainActivity',
        'AndroidManifest.xml',
        'build.gradle',
      ],
    },
    typescript: {
      complexityKeywords: [
        'react',
        'vue',
        'angular',
        'next.js',
        'nuxt',
        'nest.js',
        'express',
        'fastify',
        'prisma',
        'typeorm',
        'graphql',
        'apollo',
        'redux',
        'mobx',
        'rxjs',
        'webpack',
        'vite',
      ],
      frameworkKeywords: [
        'react',
        'vue',
        'angular',
        'svelte',
        'solid',
        'lit',
        'express',
        'koa',
        'fastify',
        'nest',
        'next',
        'nuxt',
      ],
      simplePatterns: [
        'console.log',
        'function ',
        'const ',
        'let ',
        'interface ',
      ],
      architecturalPatterns: [
        'component',
        'service',
        'module',
        'decorator',
        'middleware',
        'tsconfig.json',
        'package.json',
        'types/',
        'interfaces/',
      ],
    },
    javascript: {
      complexityKeywords: [
        'react',
        'vue',
        'angular',
        'node.js',
        'express',
        'webpack',
        'babel',
        'eslint',
        'jest',
        'cypress',
        'mongodb',
        'mongoose',
      ],
      frameworkKeywords: [
        'react',
        'vue',
        'angular',
        'svelte',
        'express',
        'koa',
        'fastify',
        'hapi',
        'meteor',
        'ember',
      ],
      simplePatterns: ['console.log', 'function', 'const', 'let', 'var'],
      architecturalPatterns: [
        'component',
        'module',
        'middleware',
        'router',
        'controller',
        'package.json',
        'webpack.config',
        '.babelrc',
      ],
    },
    shell: {
      complexityKeywords: [
        'docker',
        'kubernetes',
        'terraform',
        'ansible',
        'jenkins',
        'gitlab-ci',
        'github actions',
        'aws',
        'azure',
        'gcp',
        'systemd',
        'cron',
        'nginx',
        'apache',
        'monitoring',
      ],
      frameworkKeywords: [
        'bash',
        'zsh',
        'fish',
        'powershell',
        'docker',
        'kubernetes',
      ],
      simplePatterns: ['echo', 'ls', 'cd', 'mkdir', 'cp', 'mv', 'rm'],
      architecturalPatterns: [
        'Dockerfile',
        'docker-compose',
        'kubernetes',
        'terraform',
        'ansible',
        'pipeline',
        'deployment',
        'infrastructure',
      ],
    },
    bash: {
      complexityKeywords: [
        'docker',
        'kubernetes',
        'terraform',
        'ansible',
        'jenkins',
        'gitlab-ci',
        'github actions',
        'aws',
        'azure',
        'gcp',
        'systemd',
        'cron',
        'nginx',
        'apache',
        'monitoring',
      ],
      frameworkKeywords: [
        'bash',
        'docker',
        'kubernetes',
        'terraform',
        'ansible',
      ],
      simplePatterns: ['echo', 'ls', 'cd', 'mkdir', 'cp', 'mv', 'rm'],
      architecturalPatterns: [
        'Dockerfile',
        'docker-compose',
        'kubernetes',
        'terraform',
        'ansible',
        'pipeline',
        'deployment',
        'infrastructure',
      ],
    },
    swift: {
      complexityKeywords: [
        'ios',
        'macos',
        'swiftui',
        'uikit',
        'core data',
        'combine',
        'async/await',
        'actor',
        'concurrency',
        'networking',
        'keychain',
        'push notifications',
        'app store',
        'xcode',
        'cocoapods',
        'spm',
      ],
      frameworkKeywords: [
        'swiftui',
        'uikit',
        'appkit',
        'foundation',
        'core data',
        'combine',
        'vapor',
        'perfect',
        'kitura',
      ],
      simplePatterns: ['print(', 'func ', 'var ', 'let ', 'class ', 'struct '],
      architecturalPatterns: [
        'ViewController',
        'AppDelegate',
        'SceneDelegate',
        'Model',
        'ViewModel',
        'Coordinator',
        'Info.plist',
        'Package.swift',
      ],
    },
    go: {
      complexityKeywords: [
        'goroutines',
        'channels',
        'context',
        'sync',
        'http server',
        'grpc',
        'protobuf',
        'docker',
        'kubernetes',
        'microservices',
      ],
      frameworkKeywords: ['gin', 'echo', 'fiber', 'beego', 'revel', 'buffalo'],
      simplePatterns: ['fmt.Println', 'func main', 'package main', 'import'],
      architecturalPatterns: [
        'main.go',
        'go.mod',
        'go.sum',
        'Dockerfile',
        'handler',
      ],
    },
    rust: {
      complexityKeywords: [
        'async',
        'tokio',
        'serde',
        'diesel',
        'actix',
        'warp',
        'ownership',
        'borrowing',
        'lifetimes',
        'traits',
        'macros',
      ],
      frameworkKeywords: ['actix', 'warp', 'rocket', 'tide', 'axum', 'diesel'],
      simplePatterns: ['println!', 'fn main', 'let ', 'mut ', 'struct '],
      architecturalPatterns: [
        'Cargo.toml',
        'main.rs',
        'lib.rs',
        'mod.rs',
        'use ',
      ],
    },
    unknown: {
      complexityKeywords: [],
      frameworkKeywords: [],
      simplePatterns: [],
      architecturalPatterns: [],
    },
  },
} as const;

const LANGUAGE_INDICATORS_MAP = new Map<
  ProgrammingLanguage,
  LanguageIndicators
>(
  Object.entries(TASK_COMPLEXITY_INDICATORS.languageSpecific).map(
    ([language, indicators]) => [language as ProgrammingLanguage, indicators]
  )
);

const FRAMEWORK_LANGUAGE_MAP = new Map<Framework, ProgrammingLanguage>([
  ['django', 'python'],
  ['fastapi', 'python'],
  ['flask', 'python'],
  ['spring-boot', 'java'],
  ['spring-cloud', 'java'],
  ['react', 'typescript'],
  ['vue', 'typescript'],
  ['angular', 'typescript'],
  ['android-sdk', 'kotlin'],
  ['express', 'javascript'],
  ['nestjs', 'typescript'],
  ['next', 'typescript'],
  ['nuxt', 'typescript'],
  ['unknown', 'unknown'],
]);

/**
 * Language detection service implementation
 */
export class LanguageDetectionService implements LanguageDetector {
  /**
   * Detect primary programming language from content
   */
  public detectPrimaryLanguage(content: string): ProgrammingLanguage {
    const contentLower = content.toLowerCase();

    // Language detection patterns (order matters - more specific first)
    const languagePatterns: Array<[ProgrammingLanguage, readonly string[]]> = [
      [
        'kotlin',
        ['kotlin', 'android', 'jetpack compose', 'fun main', 'data class'],
      ],
      ['swift', ['swift', 'swiftui', 'uikit', 'ios', 'macos', 'xcode']],
      ['typescript', ['typescript', '.ts', 'interface ', 'type ', 'as const']],
      ['python', ['python', '.py', 'def ', 'import ', 'django', 'flask']],
      ['java', ['java', '.java', 'public class', 'spring', 'hibernate']],
      ['javascript', ['javascript', '.js', 'node.js', 'react', 'vue']],
      ['shell', ['bash', 'shell', '.sh', 'docker', 'kubernetes']],
      ['bash', ['#!/bin/bash', '#!/bin/sh', 'bash', 'shell script']],
      ['go', ['golang', 'go', 'func main', 'package main', 'goroutine']],
      ['rust', ['rust', '.rs', 'cargo', 'fn main', 'println!']],
    ];

    for (const [language, patterns] of languagePatterns) {
      if (patterns.some((pattern) => contentLower.includes(pattern))) {
        return language;
      }
    }

    return 'unknown';
  }

  /**
   * Detect frameworks used in the content
   */
  public detectFrameworks(
    content: string,
    language: ProgrammingLanguage
  ): readonly Framework[] {
    const contentLower = content.toLowerCase();
    const frameworks: Framework[] = [];

    // Framework detection patterns
    const frameworkPatterns: Array<[Framework, readonly string[]]> = [
      ['django', ['django', 'models.py', 'views.py', 'settings.py']],
      ['fastapi', ['fastapi', 'pydantic', 'uvicorn', '@app.']],
      ['flask', ['flask', 'app.route', 'from flask']],
      [
        'spring-boot',
        ['spring boot', '@springbootapplication', 'application.properties'],
      ],
      ['spring-cloud', ['spring cloud', 'eureka', 'zuul', 'hystrix']],
      ['react', ['react', 'jsx', 'usestate', 'useeffect', 'component']],
      ['vue', ['vue', 'vue.js', 'composition api', 'setup()', 'ref(']],
      ['angular', ['angular', '@component', '@injectable', 'ngmodule']],
      ['android-sdk', ['android', 'activity', 'fragment', 'androidmanifest']],
      ['express', ['express', 'app.get', 'app.post', 'middleware']],
      ['nestjs', ['nestjs', '@controller', '@service', '@module']],
      ['next', ['next.js', 'getstaticprops', 'getserversideprops']],
      ['nuxt', ['nuxt', 'nuxt.config', 'asyncdata', 'fetch()']],
    ];

    for (const [framework, patterns] of frameworkPatterns) {
      if (language !== 'unknown') {
        const frameworkLanguage =
          FRAMEWORK_LANGUAGE_MAP.get(framework) ?? 'unknown';
        if (frameworkLanguage !== 'unknown' && frameworkLanguage !== language) {
          continue;
        }
      }

      if (patterns.some((pattern) => contentLower.includes(pattern))) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  /**
   * Analyze task complexity based on content and language
   */
  public analyzeTaskComplexity(
    content: string,
    language: ProgrammingLanguage
  ): TaskComplexity {
    const contentLower = content.toLowerCase();
    const indicators = TASK_COMPLEXITY_INDICATORS;

    // Check for architectural complexity
    if (
      indicators.architectureKeywords.some((keyword) =>
        contentLower.includes(keyword)
      )
    ) {
      return 'architectural';
    }

    // Check for algorithmic complexity
    if (
      indicators.algorithmKeywords.some((keyword) =>
        contentLower.includes(keyword)
      )
    ) {
      return 'complex';
    }

    // Check language-specific complexity
    const languageIndicators = LANGUAGE_INDICATORS_MAP.get(language);
    const hasComplexityKeywords =
      languageIndicators?.complexityKeywords.some((keyword) =>
        contentLower.includes(keyword)
      ) ?? false;
    if (hasComplexityKeywords) {
      return 'complex';
    }

    // Check for simple patterns
    if (
      indicators.simpleTaskKeywords.some((keyword) =>
        contentLower.includes(keyword)
      )
    ) {
      return 'simple';
    }

    // Check language-specific simple patterns
    const hasSimpleIndicators =
      languageIndicators?.simplePatterns.some((pattern) =>
        contentLower.includes(pattern)
      ) ?? false;
    if (hasSimpleIndicators) {
      return 'simple';
    }

    // Default to medium complexity
    return 'medium';
  }

  /**
   * Determine development type from content
   */
  public determineDevelopmentType(content: string): DevelopmentType {
    const contentLower = content.toLowerCase();
    const indicators = TASK_COMPLEXITY_INDICATORS;

    if (
      indicators.debuggingKeywords.some((keyword) =>
        contentLower.includes(keyword)
      )
    ) {
      return 'debugging';
    }

    if (
      indicators.architectureKeywords.some((keyword) =>
        contentLower.includes(keyword)
      )
    ) {
      return 'architecture';
    }

    if (contentLower.includes('test') || contentLower.includes('spec')) {
      return 'testing';
    }

    if (
      contentLower.includes('deploy') ||
      contentLower.includes('devops') ||
      contentLower.includes('infrastructure')
    ) {
      return 'devops';
    }

    return 'completion';
  }
}

/**
 * Complexity analysis service implementation
 */
export class ComplexityAnalysisService implements ComplexityAnalyzer {
  private readonly languageDetector: LanguageDetector;

  constructor(
    languageDetector: LanguageDetector = new LanguageDetectionService()
  ) {
    this.languageDetector = languageDetector;
  }

  /**
   * Analyze content complexity factors
   */
  public analyzeContentComplexity(
    request: DeepReadonly<ClaudeRequest>
  ): ComplexityFactors {
    const allContent = this.extractAllContent(request);
    const contentLength = allContent.length;
    const messages = request.messages;
    const messageCount = messages.length;
    const codeBlockCount = this.countCodeBlocks(messages);

    const primaryLanguage =
      this.languageDetector.detectPrimaryLanguage(allContent);
    const frameworks = this.languageDetector.detectFrameworks(
      allContent,
      primaryLanguage
    );
    const complexity = this.languageDetector.analyzeTaskComplexity(
      allContent,
      primaryLanguage
    );
    const developmentType =
      this.languageDetector.determineDevelopmentType(allContent);

    const languageContext: LanguageContext = {
      primaryLanguage,
      frameworks,
      complexity,
      developmentType,
    };

    return {
      contentLength,
      messageCount,
      codeBlockCount,
      languageContext,
      hasArchitecturalKeywords: this.detectArchitecturalPatterns(allContent),
      hasAlgorithmicKeywords: this.detectAlgorithmicComplexity(allContent),
      hasDebuggingKeywords: this.detectDebuggingKeywords(allContent),
      isSimpleCompletion: this.isSimpleCompletion(allContent),
      conversationDepth: messageCount,
      hasMultipleLanguages: this.detectMultiLanguageContext(messages),
      hasComplexFrameworkPatterns: this.analyzeFrameworkComplexity(
        frameworks,
        allContent
      ),
    };
  }

  /**
   * Determine if reasoning should be used based on complexity factors
   */
  public shouldUseReasoning(factors: DeepReadonly<ComplexityFactors>): boolean {
    // Skip reasoning for very simple completions
    if (factors.isSimpleCompletion && factors.contentLength < 100) {
      return false;
    }

    // Use reasoning for complex patterns
    return (
      factors.hasArchitecturalKeywords ||
      factors.hasAlgorithmicKeywords ||
      factors.hasComplexFrameworkPatterns ||
      factors.languageContext.complexity === 'complex' ||
      factors.languageContext.complexity === 'architectural' ||
      factors.codeBlockCount > 2 ||
      factors.contentLength > 1000
    );
  }

  /**
   * Determine reasoning level based on complexity factors
   */
  public determineReasoningLevel(
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort {
    // High reasoning for architectural or very complex tasks
    if (
      factors.languageContext.complexity === 'architectural' ||
      factors.hasArchitecturalKeywords ||
      factors.hasComplexFrameworkPatterns ||
      factors.contentLength > 5000
    ) {
      return 'high';
    }

    // Medium reasoning for complex algorithmic tasks
    if (
      factors.languageContext.complexity === 'complex' ||
      factors.hasAlgorithmicKeywords ||
      factors.codeBlockCount > 3 ||
      factors.contentLength > 2000
    ) {
      return 'medium';
    }

    // Low reasoning for moderate complexity
    if (
      factors.languageContext.complexity === 'medium' ||
      factors.codeBlockCount > 1 ||
      factors.contentLength > 500
    ) {
      return 'low';
    }

    // Low reasoning for simple tasks that still need some reasoning
    return 'low'; // Changed from 'minimal' to 'low' for gpt-5-codex compatibility
  }

  /**
   * Analyze content length category
   */
  public analyzeContentLength(content: string): 'short' | 'medium' | 'long' {
    const length = content.length;
    if (length < 500) {
      return 'short';
    }
    if (length < 2000) {
      return 'medium';
    }
    return 'long';
  }

  /**
   * Count code blocks in messages
   */
  public countCodeBlocks(
    messages: readonly DeepReadonly<ClaudeMessage>[]
  ): number {
    let count = 0;

    for (const message of messages) {
      const content = this.extractMessageContent(message);
      // Count code blocks (```...``` patterns)
      const codeBlockMatches = content.match(/```[\s\S]*?```/g);
      if (codeBlockMatches) {
        count += codeBlockMatches.length;
      }
      // Count inline code (`...` patterns)
      const inlineCodeMatches = content.match(/`[^`\n]+`/g);
      if (inlineCodeMatches) {
        count += Math.ceil(inlineCodeMatches.length / 5); // Weight inline code less
      }
    }

    return count;
  }

  /**
   * Detect architectural patterns in content
   */
  public detectArchitecturalPatterns(content: string): boolean {
    const contentLower = content.toLowerCase();
    return TASK_COMPLEXITY_INDICATORS.architectureKeywords.some((keyword) =>
      contentLower.includes(keyword)
    );
  }

  /**
   * Detect algorithmic complexity indicators
   */
  public detectAlgorithmicComplexity(content: string): boolean {
    const contentLower = content.toLowerCase();
    return TASK_COMPLEXITY_INDICATORS.algorithmKeywords.some((keyword) =>
      contentLower.includes(keyword)
    );
  }

  /**
   * Detect debugging keywords
   */
  private detectDebuggingKeywords(content: string): boolean {
    const contentLower = content.toLowerCase();
    return TASK_COMPLEXITY_INDICATORS.debuggingKeywords.some((keyword) =>
      contentLower.includes(keyword)
    );
  }

  /**
   * Check if request is a simple completion
   */
  public isSimpleCompletion(content: string): boolean {
    const contentLower = content.toLowerCase();
    return TASK_COMPLEXITY_INDICATORS.simpleTaskKeywords.some((keyword) =>
      contentLower.includes(keyword)
    );
  }

  /**
   * Analyze conversation depth
   */
  public analyzeConversationDepth(
    messageCount: number
  ): 'shallow' | 'medium' | 'deep' {
    if (messageCount <= 3) {
      return 'shallow';
    }
    if (messageCount <= 10) {
      return 'medium';
    }
    return 'deep';
  }

  /**
   * Detect multi-language context
   */
  public detectMultiLanguageContext(
    messages: readonly DeepReadonly<ClaudeMessage>[]
  ): boolean {
    const languages = new Set<ProgrammingLanguage>();

    for (const message of messages) {
      const content = this.extractMessageContent(message);
      const language = this.languageDetector.detectPrimaryLanguage(content);
      if (language !== 'unknown') {
        languages.add(language);
      }
    }

    return languages.size > 1;
  }

  /**
   * Analyze framework complexity
   */
  public analyzeFrameworkComplexity(
    frameworks: readonly Framework[],
    content: string
  ): boolean {
    if (frameworks.length === 0) {
      return false;
    }

    const contentLower = content.toLowerCase();
    const complexFrameworks = [
      'spring-cloud',
      'django',
      'react',
      'vue',
      'android-sdk',
    ];

    // Check if any complex frameworks are detected
    const hasComplexFramework = frameworks.some((framework) =>
      complexFrameworks.includes(framework)
    );

    if (!hasComplexFramework) {
      return false;
    }

    // Check for architectural patterns in the content
    for (const framework of frameworks) {
      const languageKey = this.getLanguageForFramework(framework);
      if (languageKey !== 'unknown') {
        const indicators = LANGUAGE_INDICATORS_MAP.get(languageKey);
        const hasArchitecturalPatterns =
          indicators?.architecturalPatterns.some((pattern) =>
            contentLower.includes(pattern)
          ) ?? false;
        if (hasArchitecturalPatterns) {
          return true;
        }
      }
    }

    return false;
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
   * Get programming language for a framework
   */
  private getLanguageForFramework(framework: Framework): ProgrammingLanguage {
    return FRAMEWORK_LANGUAGE_MAP.get(framework) ?? 'unknown';
  }
}

/**
 * Reasoning decision engine implementation
 */
export class ReasoningDecisionEngineService implements ReasoningDecisionEngine {
  public readonly simpleCompletionThreshold = 100;
  public readonly complexityThreshold = 1000;
  public readonly architecturalKeywordWeight = 0.4;
  public readonly algorithmicKeywordWeight = 0.3;
  public readonly frameworkComplexityWeight = 0.3;
  public readonly conversationDepthWeight = 0.2;

  /**
   * Decide reasoning effort based on complexity factors
   */
  public decideReasoningEffort(
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort | undefined {
    // Skip reasoning for very simple completions
    if (
      factors.isSimpleCompletion &&
      factors.contentLength < this.simpleCompletionThreshold
    ) {
      return undefined;
    }

    // Calculate complexity score
    let complexityScore = 0;

    // Content length factor
    if (factors.contentLength > 5000) {
      complexityScore += 0.8;
    } else if (factors.contentLength > 2000) {
      complexityScore += 0.6;
    } else if (factors.contentLength > 500) {
      complexityScore += 0.3;
    }

    // Keyword factors
    if (factors.hasArchitecturalKeywords) {
      complexityScore += this.architecturalKeywordWeight;
    }
    if (factors.hasAlgorithmicKeywords) {
      complexityScore += this.algorithmicKeywordWeight;
    }
    if (factors.hasComplexFrameworkPatterns) {
      complexityScore += this.frameworkComplexityWeight;
    }

    // Code block factor
    if (factors.codeBlockCount > 3) {
      complexityScore += 0.4;
    } else if (factors.codeBlockCount > 1) {
      complexityScore += 0.2;
    }

    // Language complexity factor
    if (factors.languageContext.complexity === 'architectural') {
      complexityScore += 0.6;
    } else if (factors.languageContext.complexity === 'complex') {
      complexityScore += 0.4;
    }

    // Conversation depth factor
    if (factors.conversationDepth > 10) {
      complexityScore += this.conversationDepthWeight;
    }

    // Multi-language factor
    if (factors.hasMultipleLanguages) {
      complexityScore += 0.2;
    }

    // Determine reasoning level based on score
    if (complexityScore >= 1.0) {
      return 'high';
    } else if (complexityScore >= 0.6) {
      return 'medium';
    } else if (complexityScore >= 0.3) {
      return 'low';
    } else if (complexityScore > 0) {
      return 'low'; // Changed from 'minimal' to 'low' for gpt-5-codex compatibility
    }

    // No reasoning needed
    return undefined;
  }
}

/**
 * Main reasoning effort analyzer implementation
 */
export class ReasoningEffortAnalysisService implements ReasoningEffortAnalyzer {
  private readonly languageDetector: LanguageDetector;
  private readonly complexityAnalyzer: ComplexityAnalyzer;
  private readonly decisionEngine: ReasoningDecisionEngine;

  constructor(
    languageDetector: LanguageDetector = new LanguageDetectionService(),
    complexityAnalyzer?: ComplexityAnalyzer,
    decisionEngine: ReasoningDecisionEngine = new ReasoningDecisionEngineService()
  ) {
    this.languageDetector = languageDetector;
    this.complexityAnalyzer =
      complexityAnalyzer ?? new ComplexityAnalysisService(languageDetector);
    this.decisionEngine = decisionEngine;
  }

  /**
   * Analyze request and determine optimal reasoning effort
   */
  public analyzeRequest(
    request: DeepReadonly<ClaudeRequest>,
    context?: DeepReadonly<ConversationContext>
  ): ReasoningEffort | undefined {
    const factors = this.detectComplexityFactors(request);

    if (!this.shouldApplyReasoning(request)) {
      return undefined;
    }

    let reasoningEffort = this.decisionEngine.decideReasoningEffort(factors);

    // Adjust based on conversation context if provided
    if (context && reasoningEffort) {
      const contextAdjusted = this.adjustEffortBasedOnContext(context, factors);
      if (contextAdjusted) {
        reasoningEffort = contextAdjusted;
      }
    }

    return reasoningEffort;
  }

  /**
   * Check if reasoning should be applied to the request
   */
  public shouldApplyReasoning(request: DeepReadonly<ClaudeRequest>): boolean {
    const factors = this.detectComplexityFactors(request);
    return this.complexityAnalyzer.shouldUseReasoning(factors);
  }

  /**
   * Detect complexity factors in the request
   */
  public detectComplexityFactors(
    request: DeepReadonly<ClaudeRequest>
  ): ComplexityFactors {
    return this.complexityAnalyzer.analyzeContentComplexity(request);
  }

  /**
   * Adjust reasoning effort based on conversation context
   */
  public adjustEffortBasedOnContext(
    context: DeepReadonly<ConversationContext>,
    factors: DeepReadonly<ComplexityFactors>
  ): ReasoningEffort | undefined {
    // If conversation is already complex, maintain or increase reasoning
    if (context.taskComplexity === 'complex') {
      const baseEffort = this.decisionEngine.decideReasoningEffort(factors);
      if (baseEffort === 'minimal') {
        return 'low';
      }
      if (baseEffort === 'low') {
        return 'medium';
      }
      return baseEffort;
    }

    // For long conversations, slightly increase reasoning
    if (context.messageCount > 15) {
      const baseEffort = this.decisionEngine.decideReasoningEffort(factors);
      if (baseEffort === 'minimal') {
        return 'low';
      }
      return baseEffort;
    }

    return this.decisionEngine.decideReasoningEffort(factors);
  }

  /**
   * Detect language context from request content
   */
  public detectLanguageContext(
    request: DeepReadonly<ClaudeRequest>
  ): LanguageContext {
    const factors = this.detectComplexityFactors(request);
    return factors.languageContext;
  }
}

/**
 * Factory function to create reasoning effort analyzer
 * @returns A new reasoning effort analyzer instance
 */
export function createReasoningEffortAnalyzer(): ReasoningEffortAnalysisService {
  return new ReasoningEffortAnalysisService();
}

/**
 * Utility function to analyze reasoning effort for a request
 * @param request - The Claude request to analyze
 * @param context - Optional conversation context
 * @returns Reasoning effort level or undefined if no reasoning needed
 */
export function analyzeReasoningEffort(
  request: DeepReadonly<ClaudeRequest>,
  context?: DeepReadonly<ConversationContext>
): ReasoningEffort | undefined {
  const analyzer = createReasoningEffortAnalyzer();
  return analyzer.analyzeRequest(request, context);
}
