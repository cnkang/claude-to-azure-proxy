---
inclusion: always
---

# Code Reuse and Architecture Guidelines

## 🔄 Always Reuse Existing Code

**MANDATORY**: Before implementing any new functionality, you MUST check for existing
implementations that can be reused or extended.

### Pre-Implementation Checklist

1. **Search the codebase** for similar functionality using file search and grep
2. **Check existing modules**:
   - `src/errors/` - Error handling classes and factories
   - `src/utils/` - Utility functions and transformers
   - `src/middleware/` - Cross-cutting concerns
   - `src/types/` - Type definitions
   - `src/config/` - Configuration patterns

3. **Review existing patterns** before creating new ones
4. **Extend existing classes/interfaces** rather than creating new ones
5. **Use existing error handling** rather than custom error types

### Existing Architecture to Reuse

#### Error Handling (src/errors/index.ts)

- `ValidationError` - For input validation errors
- `AzureOpenAIError` - For Azure API errors
- `ErrorFactory` - For creating errors from API responses
- `NetworkError`, `TimeoutError` - For network issues

#### Request/Response Processing (src/utils/)

- `request-transformer.ts` - Request transformation patterns
- `response-transformer.ts` - Response transformation patterns
- Validation utilities and type guards

#### Configuration (src/config/index.ts)

- Environment variable validation with Joi
- Configuration factory functions
- Sanitization patterns

### Examples

#### ✅ GOOD: Reusing existing error handling

```typescript
import { ValidationError, ErrorFactory } from '../errors/index.js';

// Reuse existing validation error
throw new ValidationError('Invalid input', correlationId, 'field', value);

// Reuse existing error factory
return ErrorFactory.fromAzureOpenAIError(error, correlationId, operation);
```

#### ❌ BAD: Creating duplicate functionality

```typescript
// Don't create custom error classes when existing ones work
class MyCustomValidationError extends Error {
  /* duplicate */
}

// Don't reimplement error handling
function handleMyError(error) {
  /* duplicate logic */
}
```

#### ✅ GOOD: Extending existing configuration

```typescript
// Build upon existing config patterns
export function createAzureOpenAIConfig(config: Config): AzureOpenAIConfig {
  return {
    baseURL: ensureV1Endpoint(config.AZURE_OPENAI_ENDPOINT),
    apiKey: config.AZURE_OPENAI_API_KEY,
    // ... extend existing pattern
  };
}
```

### Benefits of Code Reuse

1. **Consistency** - Uniform error handling and patterns across the codebase
2. **Maintainability** - Single source of truth for common functionality
3. **Testing** - Existing code is already tested and proven
4. **Security** - Reuse security-hardened implementations
5. **Performance** - Avoid duplicate implementations

### When Creating New Code is Acceptable

Only create new implementations when:

1. **No existing functionality** covers the use case
2. **Existing code cannot be extended** to meet requirements
3. **Performance requirements** demand specialized implementation
4. **Security requirements** need isolated implementation

Even then, follow existing patterns and architectural principles.
