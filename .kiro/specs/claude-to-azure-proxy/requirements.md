# Requirements Document

## Introduction

This feature implements a TypeScript-based API proxy server that intercepts requests from Claude Code CLI and similar tools, then forwards them to Azure OpenAI's GPT-5-Codex model. The proxy will handle authentication, request transformation, and response mapping to ensure seamless compatibility between Claude API format and Azure OpenAI API format. TypeScript provides compile-time type safety, better developer experience, and enhanced code maintainability.

## Requirements

### Requirement 1

**User Story:** As a developer using Claude Code CLI, I want the tool to work with Azure OpenAI's GPT-5-Codex model, so that I can use familiar tooling while leveraging Azure's AI services.

#### Acceptance Criteria

1. WHEN a client sends a request to "/v1/models" THEN the proxy SHALL return a fixed, hardcoded models list response compatible with Claude API format
2. WHEN a client sends a request to "/v1/completions" THEN the proxy SHALL forward the request to Azure OpenAI endpoint with proper format transformation
3. WHEN the Azure OpenAI API returns a response THEN the proxy SHALL transform it back to Claude API format before returning to the client

### Requirement 2

**User Story:** As a system administrator, I want to configure the TypeScript proxy through environment variables with type safety, so that I can easily deploy and manage the service in different environments with compile-time validation.

#### Acceptance Criteria

1. WHEN the proxy starts THEN it SHALL read Azure OpenAI endpoint URL from AZURE_OPENAI_ENDPOINT environment variable
2. WHEN the proxy starts THEN it SHALL read the target model name from AZURE_OPENAI_MODEL environment variable
3. WHEN the proxy starts THEN it SHALL read Azure OpenAI API key from AZURE_OPENAI_API_KEY environment variable
4. WHEN the proxy starts THEN it SHALL read the client authentication key from PROXY_API_KEY environment variable
5. IF any required environment variable (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_MODEL, AZURE_OPENAI_API_KEY, PROXY_API_KEY) is missing THEN the proxy SHALL log an error and exit gracefully

### Requirement 3

**User Story:** As a client application, I want to authenticate with the proxy using a dedicated API key, so that I can securely access the service without knowing the underlying Azure OpenAI credentials.

#### Acceptance Criteria

1. WHEN a client sends a request with "Authorization: Bearer <token>" header THEN the proxy SHALL validate the token against the PROXY_API_KEY environment variable
2. WHEN a client sends a request with "x-api-key: <key>" header THEN the proxy SHALL validate the API key against the PROXY_API_KEY environment variable
3. IF the client's API key does not match the configured PROXY_API_KEY THEN the proxy SHALL return HTTP 401 Unauthorized with appropriate error message
4. WHEN authentication succeeds THEN the proxy SHALL use the AZURE_OPENAI_API_KEY to authenticate with Azure OpenAI backend

### Requirement 4

**User Story:** As a developer, I want the TypeScript proxy to handle request and response transformation correctly with type safety, so that Claude Code CLI works seamlessly with Azure OpenAI and type errors are caught at compile time.

#### Acceptance Criteria

1. WHEN transforming requests to Azure OpenAI format THEN the proxy SHALL use OpenAI v1 API format as specified in Microsoft documentation
2. WHEN receiving responses from Azure OpenAI THEN the proxy SHALL transform them to match Claude API response format
3. WHEN handling "/v1/models" requests THEN the proxy SHALL return a static, hardcoded response with predefined model information that mimics Claude API format
4. WHEN handling "/v1/completions" requests THEN the proxy SHALL map request parameters appropriately between the two API formats

### Requirement 5

**User Story:** As a system operator, I want proper error handling and logging, so that I can troubleshoot issues and monitor the service.

#### Acceptance Criteria

1. WHEN the proxy encounters an error THEN it SHALL log the error with appropriate detail level
2. WHEN Azure OpenAI API returns an error THEN the proxy SHALL transform and forward the error in Claude API format
3. WHEN the proxy starts successfully THEN it SHALL log the startup information including configured endpoint and model
4. WHEN requests are processed THEN the proxy SHALL log request/response information at debug level

### Requirement 6

**User Story:** As a developer, I want the TypeScript proxy to be lightweight and performant, so that it doesn't add significant latency to API calls while providing compile-time optimizations.

#### Acceptance Criteria

1. WHEN processing requests THEN the proxy SHALL add minimal processing overhead
2. WHEN forwarding requests THEN the proxy SHALL maintain connection pooling for efficiency
3. WHEN handling concurrent requests THEN the proxy SHALL support multiple simultaneous connections
4. WHEN the service is idle THEN it SHALL consume minimal system resources

### Requirement 7

**User Story:** As a DevOps engineer, I want the proxy to be compatible with AWS App Runner deployment, so that I can easily deploy and scale the service in AWS.

#### Acceptance Criteria

1. WHEN the application starts THEN it SHALL bind to the port specified by the PORT environment variable (default 8080)
2. WHEN deployed on AWS App Runner THEN the proxy SHALL respond to health check requests at "/health" endpoint
3. WHEN running in AWS App Runner THEN the proxy SHALL handle graceful shutdown on SIGTERM signals
4. WHEN the application starts THEN it SHALL be ready to serve requests within AWS App Runner's startup timeout limits
5. WHEN logging THEN the proxy SHALL output structured logs to stdout for AWS CloudWatch integration