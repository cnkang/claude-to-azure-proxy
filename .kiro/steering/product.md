---
inclusion: always
---

# Product Guidelines

## Core Product: Claude-to-Azure OpenAI Proxy

This is a production-ready TypeScript API proxy that translates Claude API requests to Azure OpenAI
format, enabling Claude Code CLI to work with Azure OpenAI services seamlessly.

## Development Principles

### API Compatibility

- Maintain strict compatibility with Claude API request/response formats
- Ensure Azure OpenAI responses are properly transformed to Claude format
- Support streaming responses with proper format conversion
- Handle all Claude model names and map them to appropriate Azure OpenAI models

### Security-First Approach

- All endpoints require authentication (Bearer token or API key)
- Implement comprehensive input validation and sanitization
- Apply rate limiting to prevent abuse
- Never expose Azure OpenAI credentials in responses or logs
- Use correlation IDs for request tracing without exposing sensitive data

### Production Readiness

- Include comprehensive error handling with user-friendly messages
- Implement circuit breakers and retry logic for external API calls
- Provide detailed health checks and monitoring endpoints
- Ensure graceful shutdown and startup procedures
- Log structured JSON with appropriate log levels

### Code Quality Standards

- Use strict TypeScript with comprehensive type definitions
- Implement comprehensive test coverage (unit, integration, security)
- Follow immutable patterns and readonly types where possible
- Apply consistent error handling patterns across all modules
- Use descriptive variable and function names that reflect business logic

## Key Business Rules

### Model Mapping

- Claude models should map to appropriate Azure OpenAI models
- Maintain model capability parity (context length, features)
- Handle unsupported model requests gracefully with clear error messages

### Request/Response Transformation

- Preserve all Claude API semantics in transformations
- Handle streaming responses identically to Claude API behavior
- Maintain request correlation and timing characteristics
- Transform error responses to match Claude API error format

### Performance Requirements

- Target sub-100ms proxy overhead for non-streaming requests
- Support concurrent requests with proper resource management
- Implement efficient memory usage for streaming responses
- Monitor and alert on performance degradation

## Deployment Considerations

### AWS App Runner Optimization

- Use PORT environment variable for dynamic port assignment
- Implement proper health check endpoints for load balancer integration
- Handle graceful shutdown for zero-downtime deployments
- Optimize Docker image size and security scanning

### Configuration Management

- Validate all environment variables at startup with clear error messages
- Support both development and production configuration patterns
- Use secure defaults and fail-fast on misconfiguration
- Document all required and optional environment variables
