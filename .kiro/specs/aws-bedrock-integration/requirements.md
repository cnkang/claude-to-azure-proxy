# Requirements Document

## Introduction

This feature extends the existing Claude-to-Azure OpenAI proxy to support AWS Bedrock models, specifically the Qwen 3 Coder model (qwen.qwen3-coder-480b-a35b-v1:0). The system will maintain the same Claude API compatibility while routing requests to either Azure OpenAI or AWS Bedrock based on the requested model, using API key authentication for AWS Bedrock to avoid AWS credential management complexity.

## Glossary

- **Proxy_System**: The existing Claude-to-Azure OpenAI proxy application
- **AWS_Bedrock_Client**: New client component for communicating with AWS Bedrock API
- **Model_Router**: Component that determines whether to route requests to Azure OpenAI or AWS Bedrock
- **Request_Transformer**: Component that transforms Claude API requests to the appropriate target format
- **Response_Transformer**: Component that transforms responses back to Claude API format
- **API_Key_Auth**: Authentication mechanism using API keys instead of AWS credentials
- **Qwen_Model**: The qwen.qwen3-coder-480b-a35b-v1:0 model on AWS Bedrock in us-west-2 region
- **Claude_API**: The original Claude API format that clients expect

## Requirements

### Requirement 1

**User Story:** As a developer using Claude Code CLI, I want to access AWS Bedrock's Qwen model through the same proxy interface, so that I can use different AI models without changing my client configuration.

#### Acceptance Criteria

1. WHEN a request contains a model parameter specifying a Qwen model name, THE Proxy_System SHALL route the request to AWS_Bedrock_Client
2. WHEN a request contains a model parameter specifying an Azure OpenAI model name, THE Proxy_System SHALL route the request to the existing Azure OpenAI client
3. THE Proxy_System SHALL maintain identical Claude_API request and response formats for both routing destinations
4. THE Proxy_System SHALL support the qwen.qwen3-coder-480b-a35b-v1:0 model in us-west-2 region with proper model name mapping based on user request model parameter
5. THE Proxy_System SHALL handle authentication using API keys for AWS Bedrock access

### Requirement 2

**User Story:** As a system administrator, I want to configure AWS Bedrock access using API keys, so that I can avoid complex AWS credential management and follow security best practices.

#### Acceptance Criteria

1. THE Proxy_System SHALL accept AWS Bedrock API key and region (us-west-2) configuration through environment variables
2. THE Proxy_System SHALL validate AWS Bedrock configuration at startup and fail-fast on invalid configuration
3. THE Proxy_System SHALL never expose AWS Bedrock API keys in logs or error responses
4. WHERE AWS Bedrock is configured, THE Proxy_System SHALL include AWS Bedrock models in health check validation
5. THE Proxy_System SHALL support both Azure OpenAI and AWS Bedrock configurations simultaneously

### Requirement 3

**User Story:** As a client application, I want streaming responses from AWS Bedrock models to work identically to Azure OpenAI streaming, so that my application logic remains unchanged.

#### Acceptance Criteria

1. WHEN a streaming request is made to a Qwen_Model, THE AWS_Bedrock_Client SHALL provide streaming responses
2. THE Response_Transformer SHALL convert AWS Bedrock streaming format to Claude_API streaming format
3. THE Proxy_System SHALL maintain identical streaming behavior timing and chunking patterns
4. IF streaming fails, THEN THE Proxy_System SHALL provide graceful fallback with appropriate error messages
5. THE Proxy_System SHALL handle streaming connection interruptions with proper cleanup

### Requirement 4

**User Story:** As a monitoring system, I want to track AWS Bedrock API usage and performance separately from Azure OpenAI, so that I can monitor and optimize each service independently.

#### Acceptance Criteria

1. THE Proxy_System SHALL log AWS Bedrock requests with distinct correlation IDs and service identifiers
2. THE Proxy_System SHALL track AWS Bedrock response times and error rates separately from Azure OpenAI metrics
3. THE Proxy_System SHALL include AWS Bedrock service status in health check endpoints
4. WHEN AWS Bedrock errors occur, THE Proxy_System SHALL log structured error information without exposing sensitive data
5. THE Proxy_System SHALL provide metrics endpoints that distinguish between Azure OpenAI and AWS Bedrock usage

### Requirement 5

**User Story:** As a client application, I want to discover all available models through the /models endpoint, so that I can dynamically select between Azure OpenAI and AWS Bedrock models.

#### Acceptance Criteria

1. THE Proxy_System SHALL return both Azure OpenAI models and AWS Bedrock models in the /models endpoint response
2. THE Proxy_System SHALL include the qwen.qwen3-coder-480b-a35b-v1:0 model alongside existing models like gpt-5-codex in the models list response
3. THE Proxy_System SHALL maintain Claude_API format for the models endpoint response
4. WHERE AWS Bedrock is not configured, THE Proxy_System SHALL only return Azure OpenAI models
5. THE Proxy_System SHALL include model metadata that distinguishes between Azure OpenAI and AWS Bedrock models

### Requirement 6

**User Story:** As a developer, I want consistent error handling across both Azure OpenAI and AWS Bedrock services, so that my error handling logic works uniformly regardless of the backend service.

#### Acceptance Criteria

1. THE Proxy_System SHALL transform AWS Bedrock errors to match Claude_API error format
2. WHEN AWS Bedrock is unavailable, THE Proxy_System SHALL provide consistent error responses with appropriate HTTP status codes
3. THE Proxy_System SHALL implement circuit breaker patterns for AWS Bedrock requests identical to Azure OpenAI
4. THE Proxy_System SHALL apply the same retry logic and timeout handling for both services
5. IF both services are unavailable, THEN THE Proxy_System SHALL provide clear service status information

### Requirement 7

**User Story:** As a client application like Claude Code CLI, I want to specify which model to use in my request, so that the proxy routes my request to the appropriate service based on my model choice.

#### Acceptance Criteria

1. WHEN a request contains a model parameter with value "qwen-3-coder" or "qwen.qwen3-coder-480b-a35b-v1:0", THE Proxy_System SHALL route the request to AWS_Bedrock_Client
2. WHEN a request contains a model parameter with value "gpt-5-codex" or other Azure model names, THE Proxy_System SHALL route the request to Azure OpenAI client
3. THE Proxy_System SHALL extract the model parameter from both Claude API format and OpenAI API format requests
4. THE Proxy_System SHALL map user-specified model names to the correct backend model identifiers
5. IF a request specifies an unsupported model name, THEN THE Proxy_System SHALL return an appropriate error response

### Requirement 8

**User Story:** As a development team, I want all AWS Bedrock integration code to meet strict quality standards, so that the codebase remains maintainable and reliable.

#### Acceptance Criteria

1. THE Proxy_System SHALL pass TypeScript type-checking with zero errors and zero warnings for all AWS Bedrock integration code
2. THE Proxy_System SHALL pass ESLint validation with zero errors and zero warnings for all AWS Bedrock integration code
3. THE Proxy_System SHALL achieve minimum 80% test coverage for all AWS Bedrock integration functionality
4. THE Proxy_System SHALL have all tests pass without errors or warnings
5. THE Proxy_System SHALL follow existing code patterns and architectural principles for AWS Bedrock integration