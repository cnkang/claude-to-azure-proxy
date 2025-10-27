# Implementation Plan

- [x] 1. Set up AWS Bedrock configuration and validation
  - Extend existing configuration system in `src/config/index.ts` with AWS Bedrock environment
    variables
  - Add Joi schema validation for AWS_BEDROCK_API_KEY, AWS_BEDROCK_REGION, AWS_BEDROCK_TIMEOUT,
    AWS_BEDROCK_MAX_RETRIES
  - Implement fail-fast validation following existing Azure configuration patterns
  - Create AWSBedrockConfig interface following AzureOpenAIConfig structure
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 2. Implement AWS Bedrock client following Azure client patterns
  - Create `src/clients/aws-bedrock-client.ts` with identical interface to AzureResponsesClient
  - Implement BedrockConverseRequest and BedrockConverseResponse type definitions in
    `src/types/index.ts`
  - Add request validation and transformation methods following existing client patterns
  - Implement error handling using existing ErrorFactory and error classes
  - Add configuration sanitization method that redacts API keys in logs
  - _Requirements: 1.1, 2.3, 6.1, 6.2_

- [x] 3. Implement Bedrock streaming response handling
  - Add createResponseStream method to AWSBedrockClient with identical signature to Azure client
  - Implement Bedrock streaming chunk parsing and transformation to Claude API format
  - Add proper streaming error handling and connection cleanup
  - Ensure streaming behavior matches Azure OpenAI timing and chunking patterns
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Extend request processor with model-based routing logic
  - Modify `src/utils/universal-request-processor.ts` to extract model parameter from requests
  - Implement routing logic: qwen models → Bedrock, gpt models → Azure, default → Azure
  - Support both Claude API and OpenAI API request formats for model extraction
  - Add model name mapping from user-friendly names to backend model identifiers
  - Handle unsupported model requests with appropriate error responses
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 5. Implement request/response transformation for Bedrock format
  - Create transformation functions to convert Claude API requests to Bedrock Converse API format
  - Implement response transformation from Bedrock format back to Claude API format
  - Add streaming chunk transformation maintaining Claude API streaming format
  - Ensure all transformations preserve Claude API semantics and compatibility
  - _Requirements: 1.3, 3.2, 6.1_

- [x] 6. Extend error handling and resilience patterns for Bedrock
  - Add Bedrock error mapping to existing error handling infrastructure
  - Implement circuit breaker registration for AWS Bedrock API following Azure patterns
  - Add retry logic and timeout handling identical to Azure OpenAI configuration
  - Ensure consistent error response format across both services
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Update completions endpoint to support both Azure and Bedrock clients
  - Implement the `handleBedrockRequest` function in `src/routes/completions.ts` to process Bedrock
    requests
  - Add circuit breaker and retry logic for Bedrock requests following Azure patterns
  - Implement both streaming and non-streaming Bedrock request handling
  - Ensure identical request processing pipeline and error handling for both client types
  - Maintain existing correlation ID and logging patterns for both services
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 8. Extend models endpoint with conditional Bedrock model listing
  - Modify `src/routes/models.ts` to include Bedrock models when AWS_BEDROCK_API_KEY is configured
  - Add qwen-3-coder and qwen.qwen3-coder-480b-a35b-v1:0 to models list with provider metadata
  - Maintain Claude API format for models endpoint response
  - Only include Bedrock models when properly configured
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Implement monitoring and metrics for Bedrock integration
  - Add Bedrock-specific request tracking with distinct correlation IDs and service identifiers
  - Implement separate performance metrics collection for AWS Bedrock vs Azure OpenAI
  - Extend health check endpoint to include AWS Bedrock service status validation
  - Add structured logging for Bedrock operations without exposing sensitive data
  - Create metrics endpoints that distinguish between Azure and Bedrock usage
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 10. Extend existing test suites with comprehensive Bedrock coverage
  - Add Bedrock client tests to existing client test patterns achieving >80% coverage
  - Extend request processor tests with model routing scenarios
  - Add Bedrock transformation tests to existing transformer test suites
  - Include streaming response tests with proper cleanup validation
  - Add integration tests for end-to-end Bedrock request flow
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10.1 Add comprehensive unit tests for AWS Bedrock client
  - Write unit tests for AWSBedrockClient configuration validation
  - Test request transformation and response parsing methods
  - Validate error handling and circuit breaker integration
  - _Requirements: 8.3, 8.4_

- [x] 10.2 Add integration tests for model routing and end-to-end flows
  - Test complete request flow from client to Bedrock and back
  - Validate streaming response handling and cleanup
  - Test error scenarios and fallback behavior
  - _Requirements: 8.3, 8.4_

- [x] 10.3 Add security tests for Bedrock API key handling
  - Validate API key sanitization in logs and error responses
  - Test configuration validation and fail-fast behavior
  - Verify no sensitive data exposure in error responses
  - _Requirements: 2.3, 8.3_

- [x] 11. Update configuration documentation and deployment guides
  - Add AWS Bedrock environment variables to `.env.example` with documentation
  - Update existing configuration validation documentation
  - Document model routing behavior and supported model names
  - Add deployment considerations for AWS Bedrock integration
  - _Requirements: 2.1, 2.2, 5.2_

- [x] 12. Validate TypeScript and ESLint compliance for all Bedrock code
  - Ensure all new TypeScript code passes strict type checking with zero errors/warnings
  - Validate ESLint compliance with zero errors/warnings for all Bedrock integration files
  - Run comprehensive test suite to ensure all tests pass without errors
  - Verify minimum 80% test coverage for all Bedrock functionality
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
