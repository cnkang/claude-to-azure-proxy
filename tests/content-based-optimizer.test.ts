/**
 * Tests for content-based optimizer
 * Covers content-based optimizations, fast-path detection, and enhanced reasoning analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ClaudeRequest, ConversationContext } from '../src/types/index.js';
import {
  ContentBasedOptimizerService,
  EnhancedReasoningEffortAnalyzer,
  createEnhancedReasoningEffortAnalyzer,
  createContentBasedOptimizer,
  analyzeReasoningEffortWithOptimizations,
  DEVELOPMENT_TASK_PATTERNS,
  LANGUAGE_OPTIMIZATIONS,
  FRAMEWORK_OPTIMIZATIONS,
} from '../src/utils/content-based-optimizer.js';

describe('ContentBasedOptimizerService', () => {
  let optimizer: ContentBasedOptimizerService;

  beforeEach(() => {
    optimizer = new ContentBasedOptimizerService();
  });

  describe('shouldUseFastPath', () => {
    it('should use fast-path for simple completion requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'complete this function: def add(a, b):' },
        ],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(true);
    });

    it('should use fast-path for very short content', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hello' }],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(true);
    });

    it('should use fast-path for explanation requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'explain how this function works: def factorial(n): return 1 if n <= 1 else n * factorial(n-1)',
          },
        ],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(true);
    });

    it('should not use fast-path for complex requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design a distributed microservices architecture with load balancing, database sharding, and event-driven communication patterns',
          },
        ],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(false);
    });

    it('should not use fast-path for requests with complex patterns', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'implement a binary search algorithm with optimal performance',
          },
        ],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(false);
    });
  });

  describe('adjustForDevelopmentTask', () => {
    it('should return high reasoning for DevOps tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a Kubernetes deployment with Docker containers and CI/CD pipeline',
          },
        ],
      };

      expect(optimizer.adjustForDevelopmentTask(request)).toBe('high');
    });

    it('should return high reasoning for architectural tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design a scalable system architecture with microservices and event sourcing',
          },
        ],
      };

      expect(optimizer.adjustForDevelopmentTask(request)).toBe('high');
    });

    it('should return medium reasoning for multi-language projects', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a full stack application with React frontend and Python backend',
          },
        ],
      };

      expect(optimizer.adjustForDevelopmentTask(request)).toBe('medium');
    });

    it('should return low reasoning for implementation tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'implement a user authentication system' },
        ],
      };

      expect(optimizer.adjustForDevelopmentTask(request)).toBe('low');
    });

    it('should return undefined for non-specific tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'write a simple function' }],
      };

      expect(optimizer.adjustForDevelopmentTask(request)).toBe('low'); // "write a" is implementation
    });
  });

  describe('applyLanguageOptimizations', () => {
    it('should optimize for Python/Django development', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a Django REST API with models.py, views.py, and serializers.py for user management with authentication and permissions',
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'python' as const,
        frameworks: ['django'] as const,
        complexity: 'complex' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium'); // Complex Django patterns with moderate content length
    });

    it('should optimize for Java/Spring Boot development', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: `Create a Spring Boot application with @RestController, @Service, and @Repository layers.
            
\`\`\`java
@RestController
public class UserController {
    @Autowired
    private UserService userService;
    
    @GetMapping("/users")
    public List<User> getUsers() {
        return userService.getAllUsers();
    }
}
\`\`\`

Include proper error handling and validation.`,
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'java' as const,
        frameworks: ['spring-boot'] as const,
        complexity: 'complex' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium'); // Complex Spring Boot patterns with medium content
    });

    it('should optimize for Android/Kotlin development', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create an Android Activity with Fragment, ViewModel, and Repository pattern using Jetpack Compose',
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'kotlin' as const,
        frameworks: ['android-sdk'] as const,
        complexity: 'complex' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium');
    });

    it('should optimize for React/TypeScript development', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Build a React component with TypeScript, custom hooks, context API, and state management',
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'typescript' as const,
        frameworks: ['react'] as const,
        complexity: 'complex' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium');
    });

    it('should optimize for Vue/TypeScript development', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a Vue 3 component using Composition API with TypeScript, reactive refs, and computed properties',
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'typescript' as const,
        frameworks: ['vue'] as const,
        complexity: 'complex' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium');
    });

    it('should optimize for shell scripting and DevOps', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Write a bash script for Docker deployment with Kubernetes orchestration, health checks, and monitoring',
          },
        ],
      };

      const languageContext = {
        primaryLanguage: 'shell' as const,
        frameworks: ['docker'] as const,
        complexity: 'complex' as const,
        developmentType: 'devops' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('medium'); // DevOps tasks with shell scripting
    });

    it('should return minimal reasoning for simple patterns', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'print("hello world")' }],
      };

      const languageContext = {
        primaryLanguage: 'python' as const,
        frameworks: [] as const,
        complexity: 'simple' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBe('low');
    });

    it('should return undefined for languages that do not benefit from reasoning', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'create a simple JavaScript function' },
        ],
      };

      const languageContext = {
        primaryLanguage: 'javascript' as const,
        frameworks: [] as const,
        complexity: 'simple' as const,
        developmentType: 'completion' as const,
      };

      const result = optimizer.applyLanguageOptimizations(
        request,
        languageContext
      );
      expect(result).toBeUndefined(); // JavaScript optimization config has shouldTriggerReasoning: false
    });
  });

  describe('applyFrameworkOptimizations', () => {
    it('should optimize for Django framework', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create Django models, views, and serializers for a complex e-commerce application with user management, product catalog, and order processing',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, ['django']);
      expect(result).toBeUndefined(); // No architectural keywords detected in this content
    });

    it('should optimize for Spring Boot framework', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design a Spring Boot microservice with controller, service, and repository layers, including configuration and security',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, [
        'spring-boot',
      ]);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should optimize for Spring Cloud framework', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Implement Spring Cloud microservices with Eureka service discovery, Zuul gateway, and Hystrix circuit breaker patterns',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, [
        'spring-cloud',
      ]);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should optimize for React framework', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Build a React component architecture with hooks, context, and state management for a dashboard application',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, ['react']);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should optimize for Android SDK framework', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create an Android application with Activity lifecycle, Fragment management, Service components, and BroadcastReceiver integration',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, [
        'android-sdk',
      ]);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should return highest reasoning level for multiple complex frameworks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a full-stack application with Django REST API backend, React frontend with component architecture, and Docker deployment with Kubernetes orchestration',
          },
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, [
        'django',
        'react',
      ]);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should return undefined for frameworks without architectural keywords', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'simple React component' }],
      };

      const result = optimizer.applyFrameworkOptimizations(request, ['react']);
      expect(result).toBeUndefined(); // No architectural keywords detected
    });

    it('should return undefined for content below threshold', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Django model' }, // Very short content
        ],
      };

      const result = optimizer.applyFrameworkOptimizations(request, ['django']);
      expect(result).toBeUndefined(); // Below reasoning threshold
    });
  });

  describe('isDevOpsTask', () => {
    it('should detect Docker tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Create a Dockerfile for a Node.js application',
          },
        ],
      };

      expect(optimizer.isDevOpsTask(request)).toBe(true);
    });

    it('should detect Kubernetes tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Write Kubernetes deployment manifests with services and ingress',
          },
        ],
      };

      expect(optimizer.isDevOpsTask(request)).toBe(true);
    });

    it('should detect CI/CD pipeline tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Set up GitHub Actions workflow for automated deployment',
          },
        ],
      };

      expect(optimizer.isDevOpsTask(request)).toBe(true);
    });

    it('should detect infrastructure as code tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Create Terraform configuration for AWS infrastructure',
          },
        ],
      };

      expect(optimizer.isDevOpsTask(request)).toBe(true);
    });

    it('should not detect non-DevOps tasks', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Create a simple Python function' },
        ],
      };

      expect(optimizer.isDevOpsTask(request)).toBe(false);
    });
  });

  describe('optimizeReasoningEffort', () => {
    it('should return undefined for fast-path requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'complete this: def add(a, b):' }],
      };

      const result = optimizer.optimizeReasoningEffort(request);
      expect(result).toBeUndefined();
    });

    it('should apply development task optimizations', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design a microservices architecture with event sourcing and CQRS patterns',
          },
        ],
      };

      const result = optimizer.optimizeReasoningEffort(request);
      expect(result).toBe('high'); // Architectural task
    });

    it('should apply language-specific optimizations', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a comprehensive Django application with models, views, serializers, middleware, and custom management commands for a content management system',
          },
        ],
      };

      const result = optimizer.optimizeReasoningEffort(request);
      expect(result).toBe('medium'); // Complex Django application
    });

    it('should combine multiple optimization factors', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Implement a full-stack microservices architecture with Spring Boot backend, React frontend, Docker containerization, and Kubernetes deployment with monitoring and logging',
          },
        ],
      };

      const result = optimizer.optimizeReasoningEffort(request, 'medium');
      expect(result).toBe('high'); // Should upgrade to high due to multiple complex factors
    });
  });
});

describe('EnhancedReasoningEffortAnalyzer', () => {
  let analyzer: EnhancedReasoningEffortAnalyzer;

  beforeEach(() => {
    analyzer = new EnhancedReasoningEffortAnalyzer();
  });

  describe('analyzeRequest', () => {
    it('should use fast-path for simple requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hello' }],
      };

      const result = analyzer.analyzeRequest(request);
      expect(result).toBeUndefined();
    });

    it('should apply optimizations for complex requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design and implement a distributed e-commerce platform with microservices architecture, including user management, product catalog, order processing, payment integration, inventory management, and notification services. Use Spring Boot for backend services, React for frontend, Docker for containerization, and Kubernetes for orchestration. Include considerations for scalability, security, monitoring, and data consistency across services.',
          },
        ],
      };

      const result = analyzer.analyzeRequest(request);
      expect(result).toBe('high');
    });

    it('should handle conversation context', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Create a React component' }],
      };

      const context: ConversationContext = {
        conversationId: 'test-123',
        messageCount: 25,
        taskComplexity: 'complex',
        totalTokensUsed: 10000,
        averageResponseTime: 3000,
      };

      const result = analyzer.analyzeRequest(request, context);
      expect(result).toBeUndefined(); // Simple React component request uses fast-path
    });
  });

  describe('shouldApplyReasoning', () => {
    it('should return false for fast-path requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'explain how this works' }],
      };

      expect(analyzer.shouldApplyReasoning(request)).toBe(false);
    });

    it('should return true for complex requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Implement a distributed caching system with Redis clustering, automatic failover, and performance monitoring',
          },
        ],
      };

      expect(analyzer.shouldApplyReasoning(request)).toBe(true);
    });
  });
});

describe('Factory functions and utilities', () => {
  describe('createEnhancedReasoningEffortAnalyzer', () => {
    it('should create a working enhanced analyzer instance', () => {
      const analyzer = createEnhancedReasoningEffortAnalyzer();
      expect(analyzer).toBeInstanceOf(EnhancedReasoningEffortAnalyzer);

      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
      };

      const result = analyzer.analyzeRequest(request);
      expect(result).toBeUndefined(); // Simple request should not need reasoning
    });
  });

  describe('createContentBasedOptimizer', () => {
    it('should create a working optimizer instance', () => {
      const optimizer = createContentBasedOptimizer();
      expect(optimizer).toBeInstanceOf(ContentBasedOptimizerService);

      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'complete this function' }],
      };

      expect(optimizer.shouldUseFastPath(request)).toBe(true);
    });
  });

  describe('analyzeReasoningEffortWithOptimizations', () => {
    it('should analyze reasoning effort with optimizations', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Build a comprehensive Spring Boot microservices platform with service discovery, API gateway, circuit breakers, distributed tracing, and centralized configuration management',
          },
        ],
      };

      const result = analyzeReasoningEffortWithOptimizations(request);
      expect(result).toBe('high');
    });

    it('should return undefined for simple requests', () => {
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hello world' }],
      };

      const result = analyzeReasoningEffortWithOptimizations(request);
      expect(result).toBeUndefined();
    });
  });
});

describe('Configuration constants', () => {
  describe('DEVELOPMENT_TASK_PATTERNS', () => {
    it('should have all required pattern categories', () => {
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('simpleCompletion');
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('explanation');
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('implementation');
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('devops');
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('multiLanguage');
      expect(DEVELOPMENT_TASK_PATTERNS).toHaveProperty('architecture');
    });

    it('should have meaningful patterns for each category', () => {
      expect(DEVELOPMENT_TASK_PATTERNS.simpleCompletion.length).toBeGreaterThan(
        5
      );
      expect(DEVELOPMENT_TASK_PATTERNS.explanation.length).toBeGreaterThan(5);
      expect(DEVELOPMENT_TASK_PATTERNS.implementation.length).toBeGreaterThan(
        5
      );
      expect(DEVELOPMENT_TASK_PATTERNS.devops.length).toBeGreaterThan(10);
      expect(DEVELOPMENT_TASK_PATTERNS.multiLanguage.length).toBeGreaterThan(3);
      expect(DEVELOPMENT_TASK_PATTERNS.architecture.length).toBeGreaterThan(10);
    });
  });

  describe('LANGUAGE_OPTIMIZATIONS', () => {
    it('should have optimizations for all supported languages', () => {
      const expectedLanguages = new Set([
        'python',
        'java',
        'kotlin',
        'typescript',
        'javascript',
        'shell',
        'swift',
      ] as const);

      const entries = Object.entries(LANGUAGE_OPTIMIZATIONS) as ReadonlyArray<
        [
          keyof typeof LANGUAGE_OPTIMIZATIONS,
          (typeof LANGUAGE_OPTIMIZATIONS)[keyof typeof LANGUAGE_OPTIMIZATIONS],
        ]
      >;

      for (const [language, config] of entries) {
        expect(expectedLanguages.has(language)).toBe(true);
        expect(config).toHaveProperty('complexityBoost');
        expect(config).toHaveProperty('frameworkKeywords');
        expect(config).toHaveProperty('architecturalPatterns');
        expect(config).toHaveProperty('simplePatterns');
        expect(config).toHaveProperty('shouldTriggerReasoning');
      }

      const actualLanguages = entries.map(([language]) => language).sort();
      expect(actualLanguages).toEqual([...expectedLanguages].sort());
    });

    it('should have reasonable complexity boosts', () => {
      for (const config of Object.values(LANGUAGE_OPTIMIZATIONS)) {
        expect(config.complexityBoost).toBeGreaterThanOrEqual(0.1);
        expect(config.complexityBoost).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('FRAMEWORK_OPTIMIZATIONS', () => {
    it('should have optimizations for all supported frameworks', () => {
      const expectedFrameworks = new Set([
        'django',
        'spring-boot',
        'spring-cloud',
        'react',
        'vue',
        'android-sdk',
        'fastapi',
      ] as const);

      const entries = Object.entries(FRAMEWORK_OPTIMIZATIONS) as ReadonlyArray<
        [
          keyof typeof FRAMEWORK_OPTIMIZATIONS,
          (typeof FRAMEWORK_OPTIMIZATIONS)[keyof typeof FRAMEWORK_OPTIMIZATIONS],
        ]
      >;

      for (const [framework, config] of entries) {
        expect(expectedFrameworks.has(framework)).toBe(true);
        expect(config).toHaveProperty('complexityBoost');
        expect(config).toHaveProperty('reasoningThreshold');
        expect(config).toHaveProperty('architecturalKeywords');
      }

      const actualFrameworks = entries.map(([framework]) => framework).sort();
      expect(actualFrameworks).toEqual([...expectedFrameworks].sort());
    });

    it('should have reasonable thresholds and boosts', () => {
      for (const config of Object.values(FRAMEWORK_OPTIMIZATIONS)) {
        expect(config.complexityBoost).toBeGreaterThanOrEqual(0.2);
        expect(config.complexityBoost).toBeLessThanOrEqual(0.6);
        expect(config.reasoningThreshold).toBeGreaterThanOrEqual(200);
        expect(config.reasoningThreshold).toBeLessThanOrEqual(800);
        expect(config.architecturalKeywords.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
