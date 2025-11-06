import { v4 as uuidv4 } from 'uuid';
import type {
  OpenAIRequest,
  OpenAIMessage,
  OpenAIToolDefinition,
  ResponsesCreateParams,
  ResponseMessage,
  ReasoningEffort,
  ConversationContext,
  OpenAIToolCall,
} from '../types/index';
import { ValidationError } from '../errors/index';

type UnknownRecord = Record<string, unknown>;
type ToolChoice = OpenAIRequest['tool_choice'];
type ResponseFormat = OpenAIRequest['response_format'];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;

/**
 * Transforms OpenAI API requests to Azure OpenAI Responses API format
 * Handles message transformation, parameter mapping, and conversation context
 */
export class OpenAIToResponsesTransformer {
  private readonly correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  /**
   * Transform OpenAI request to Responses API format
   */
  public transformRequest(
    openaiRequestInput: unknown,
    reasoningEffort: ReasoningEffort = 'medium',
    conversationContext?: Readonly<ConversationContext>
  ): ResponsesCreateParams {
    const openaiRequest = this.validateOpenAIRequest(openaiRequestInput);

    const messages = this.transformMessages(openaiRequest.messages);
    const input = this.convertMessagesToInput(messages);

    const params: ResponsesCreateParams = {
      model: openaiRequest.model,
      input,
      reasoning: {
        effort: reasoningEffort,
      },
    };

    const maxTokens =
      openaiRequest.max_completion_tokens ?? openaiRequest.max_tokens;
    if (maxTokens !== undefined) {
      (params as { max_output_tokens: number }).max_output_tokens = maxTokens;
    }

    if (openaiRequest.temperature !== undefined) {
      (params as { temperature: number }).temperature =
        openaiRequest.temperature;
    }

    if (openaiRequest.top_p !== undefined) {
      (params as { top_p: number }).top_p = openaiRequest.top_p;
    }

    if (openaiRequest.stream !== undefined) {
      (params as { stream: boolean }).stream = openaiRequest.stream;
    }

    if (
      conversationContext !== undefined &&
      typeof conversationContext.previousResponseId === 'string' &&
      conversationContext.previousResponseId.length > 0
    ) {
      (params as { previous_response_id: string }).previous_response_id =
        conversationContext.previousResponseId;
    }

    if (openaiRequest.tools !== undefined && openaiRequest.tools.length > 0) {
      (
        params as {
          tools: readonly import('../types/index.js').ResponsesTool[];
        }
      ).tools = this.transformTools(openaiRequest.tools);
    }

    if (openaiRequest.tool_choice !== undefined) {
      const transformedToolChoice = this.transformToolChoice(
        openaiRequest.tool_choice
      );
      if (transformedToolChoice !== undefined) {
        (
          params as {
            tool_choice:
              | 'auto'
              | 'none'
              | {
                  readonly type: 'function';
                  readonly function: { readonly name: string };
                };
          }
        ).tool_choice = transformedToolChoice;
      }
    }

    if (openaiRequest.response_format !== undefined) {
      const transformedResponseFormat = this.transformResponseFormat(
        openaiRequest.response_format
      );
      if (transformedResponseFormat !== undefined) {
        (
          params as {
            response_format: {
              readonly type: 'text' | 'json_object' | 'json_schema';
              readonly json_schema?: import('../types/index.js').JsonSchema;
            };
          }
        ).response_format = transformedResponseFormat;
      }
    }

    return params;
  }

  /**
   * Validate OpenAI request structure and return sanitized request
   */
  private validateOpenAIRequest(request: unknown): OpenAIRequest {
    if (!isRecord(request)) {
      throw new ValidationError(
        'OpenAI request must be an object',
        this.correlationId,
        'request',
        request
      );
    }

    const requestRecord: UnknownRecord = request;

    const modelValue = requestRecord.model;
    if (typeof modelValue !== 'string' || modelValue.length === 0) {
      throw new ValidationError(
        'Model is required and must be a string',
        this.correlationId,
        'model',
        modelValue
      );
    }

    const messagesValue = requestRecord.messages;
    if (!Array.isArray(messagesValue) || messagesValue.length === 0) {
      throw new ValidationError(
        'Messages array is required and must not be empty',
        this.correlationId,
        'messages',
        messagesValue
      );
    }

    const messages = messagesValue.map((message, index) =>
      this.validateOpenAIMessage(message, index)
    ) as readonly OpenAIMessage[];

    const optionalFields: {
      max_tokens?: number;
      max_completion_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
      tools?: readonly OpenAIToolDefinition[];
      tool_choice?: ToolChoice;
      response_format?: ResponseFormat;
    } = {};

    if (
      'max_tokens' in requestRecord &&
      requestRecord.max_tokens !== undefined
    ) {
      const maxTokensValue = requestRecord.max_tokens;
      if (typeof maxTokensValue !== 'number' || Number.isNaN(maxTokensValue)) {
        throw new ValidationError(
          'max_tokens must be a number',
          this.correlationId,
          'max_tokens',
          maxTokensValue
        );
      }
      optionalFields.max_tokens = maxTokensValue;
    }

    if (
      'max_completion_tokens' in requestRecord &&
      requestRecord.max_completion_tokens !== undefined
    ) {
      const maxCompletionTokensValue = requestRecord.max_completion_tokens;
      if (
        typeof maxCompletionTokensValue !== 'number' ||
        Number.isNaN(maxCompletionTokensValue)
      ) {
        throw new ValidationError(
          'max_completion_tokens must be a number',
          this.correlationId,
          'max_completion_tokens',
          maxCompletionTokensValue
        );
      }
      optionalFields.max_completion_tokens = maxCompletionTokensValue;
    }

    if (
      'temperature' in requestRecord &&
      requestRecord.temperature !== undefined
    ) {
      const temperatureValue = requestRecord.temperature;
      if (
        typeof temperatureValue !== 'number' ||
        Number.isNaN(temperatureValue)
      ) {
        throw new ValidationError(
          'temperature must be a number',
          this.correlationId,
          'temperature',
          temperatureValue
        );
      }
      optionalFields.temperature = temperatureValue;
    }

    if ('top_p' in requestRecord && requestRecord.top_p !== undefined) {
      const topPValue = requestRecord.top_p;
      if (typeof topPValue !== 'number' || Number.isNaN(topPValue)) {
        throw new ValidationError(
          'top_p must be a number',
          this.correlationId,
          'top_p',
          topPValue
        );
      }
      optionalFields.top_p = topPValue;
    }

    if ('stream' in requestRecord && requestRecord.stream !== undefined) {
      const streamValue = requestRecord.stream;
      if (typeof streamValue !== 'boolean') {
        throw new ValidationError(
          'stream must be a boolean',
          this.correlationId,
          'stream',
          streamValue
        );
      }
      optionalFields.stream = streamValue;
    }

    if ('tools' in requestRecord && requestRecord.tools !== undefined) {
      optionalFields.tools = this.validateOpenAITools(requestRecord.tools);
    }

    if (
      'tool_choice' in requestRecord &&
      requestRecord.tool_choice !== undefined
    ) {
      optionalFields.tool_choice = this.validateToolChoice(
        requestRecord.tool_choice
      );
    }

    if (
      'response_format' in requestRecord &&
      requestRecord.response_format !== undefined
    ) {
      optionalFields.response_format = this.validateResponseFormat(
        requestRecord.response_format
      );
    }

    return {
      model: modelValue,
      messages,
      ...optionalFields,
    };
  }

  /**
   * Validate individual OpenAI message
   */
  private validateOpenAIMessage(
    message: unknown,
    index: number
  ): OpenAIMessage {
    if (!isRecord(message)) {
      throw new ValidationError(
        `Message at index ${index} must be an object`,
        this.correlationId,
        `messages[${index}]`,
        message
      );
    }

    const roleValue = message.role;
    if (
      roleValue !== 'user' &&
      roleValue !== 'assistant' &&
      roleValue !== 'system' &&
      roleValue !== 'tool'
    ) {
      throw new ValidationError(
        `Invalid message role at index ${index}`,
        this.correlationId,
        `messages[${index}].role`,
        roleValue
      );
    }

    let contentValue = message.content;
    if (
      contentValue !== null &&
      contentValue !== undefined &&
      typeof contentValue !== 'string'
    ) {
      throw new ValidationError(
        `Message content must be string or null at index ${index}`,
        this.correlationId,
        `messages[${index}].content`,
        contentValue
      );
    }

    // Allow missing content for assistant messages with tool calls
    const hasToolCalls =
      'tool_calls' in message &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0;

    // Allow empty content for messages that may have been sanitized
    // Only require content for user messages without tool calls
    if (contentValue === undefined && roleValue === 'user' && !hasToolCalls) {
      // Provide default content instead of throwing error
      contentValue = '[Content was sanitized and removed for security]';
    }

    const sanitizedContent =
      typeof contentValue === 'string' ? contentValue : null;

    let toolCalls: readonly OpenAIToolCall[] | undefined;

    if ('tool_calls' in message && message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls)) {
        throw new ValidationError(
          `tool_calls must be an array at index ${index}`,
          this.correlationId,
          `messages[${index}].tool_calls`,
          message.tool_calls
        );
      }

      toolCalls = message.tool_calls.map((toolCall, toolIndex) =>
        this.validateToolCall(toolCall, index, toolIndex)
      ) as readonly OpenAIToolCall[];
    }

    let toolCallIdentifier: string | undefined;
    if (roleValue === 'tool') {
      const toolCallValue = message.tool_call_id;
      if (typeof toolCallValue !== 'string' || toolCallValue.length === 0) {
        throw new ValidationError(
          `tool_call_id is required for tool messages at index ${index}`,
          this.correlationId,
          `messages[${index}].tool_call_id`,
          toolCallValue
        );
      }
      toolCallIdentifier = toolCallValue;
    }

    let messageName: string | undefined;
    if ('name' in message && message.name !== undefined) {
      const nameCandidate = message.name;
      if (typeof nameCandidate !== 'string' || nameCandidate.length === 0) {
        throw new ValidationError(
          `name must be a non-empty string at index ${index}`,
          this.correlationId,
          `messages[${index}].name`,
          nameCandidate
        );
      }
      messageName = nameCandidate;
    }

    return {
      role: roleValue,
      content: sanitizedContent,
      ...(toolCalls !== undefined && { tool_calls: toolCalls }),
      ...(toolCallIdentifier !== undefined && {
        tool_call_id: toolCallIdentifier,
      }),
      ...(messageName !== undefined && { name: messageName }),
    };
  }

  /**
   * Validate OpenAI tool call
   */
  private validateToolCall(
    toolCall: unknown,
    messageIndex: number,
    toolIndex: number
  ): OpenAIToolCall {
    if (!isRecord(toolCall)) {
      throw new ValidationError(
        `Tool call must be an object at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}]`,
        toolCall
      );
    }

    if (typeof toolCall.id !== 'string' || toolCall.id.length === 0) {
      throw new ValidationError(
        `Tool call id is required at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}].id`,
        toolCall.id
      );
    }

    if (toolCall.type !== 'function') {
      throw new ValidationError(
        `Tool call type must be "function" at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}].type`,
        toolCall.type
      );
    }

    if (!isRecord(toolCall.function)) {
      throw new ValidationError(
        `Tool call function must be an object at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}].function`,
        toolCall.function
      );
    }

    if (
      typeof toolCall.function.name !== 'string' ||
      toolCall.function.name.length === 0
    ) {
      throw new ValidationError(
        `Tool call function name is required at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}].function.name`,
        toolCall.function.name
      );
    }

    if (typeof toolCall.function.arguments !== 'string') {
      throw new ValidationError(
        `Tool call function arguments must be a string at message ${messageIndex}, index ${toolIndex}`,
        this.correlationId,
        `messages[${messageIndex}].tool_calls[${toolIndex}].function.arguments`,
        toolCall.function.arguments
      );
    }

    return toolCall as unknown as OpenAIToolCall;
  }

  /**
   * Validate OpenAI tool definitions
   */
  private validateOpenAITools(tools: unknown): readonly OpenAIToolDefinition[] {
    if (!Array.isArray(tools)) {
      throw new ValidationError(
        'tools must be an array when provided',
        this.correlationId,
        'tools',
        tools
      );
    }

    const sanitizedTools: OpenAIToolDefinition[] = [];

    tools.forEach((tool, index) => {
      if (!isRecord(tool)) {
        throw new ValidationError(
          `Tool definition must be an object at index ${index}`,
          this.correlationId,
          `tools[${index}]`,
          tool
        );
      }

      if (tool.type !== 'function') {
        throw new ValidationError(
          `Tool type must be "function" at index ${index}`,
          this.correlationId,
          `tools[${index}].type`,
          tool.type
        );
      }

      if (!isRecord(tool.function)) {
        throw new ValidationError(
          `Tool function must be an object at index ${index}`,
          this.correlationId,
          `tools[${index}].function`,
          tool.function
        );
      }

      if (
        typeof tool.function.name !== 'string' ||
        tool.function.name.length === 0
      ) {
        throw new ValidationError(
          `Tool function name is required at index ${index}`,
          this.correlationId,
          `tools[${index}].function.name`,
          tool.function.name
        );
      }

      if (
        typeof tool.function.description !== 'string' ||
        tool.function.description.length === 0
      ) {
        throw new ValidationError(
          `Tool function description is required at index ${index}`,
          this.correlationId,
          `tools[${index}].function.description`,
          tool.function.description
        );
      }

      if (!isRecord(tool.function.parameters)) {
        throw new ValidationError(
          `Tool function parameters must be an object at index ${index}`,
          this.correlationId,
          `tools[${index}].function.parameters`,
          tool.function.parameters
        );
      }

      sanitizedTools.push(tool as unknown as OpenAIToolDefinition);
    });

    return sanitizedTools as readonly OpenAIToolDefinition[];
  }

  /**
   * Validate tool choice configuration
   */
  private validateToolChoice(toolChoice: unknown): ToolChoice | undefined {
    if (toolChoice === undefined) {
      return undefined;
    }

    if (toolChoice === 'auto' || toolChoice === 'none') {
      return toolChoice;
    }

    if (
      isRecord(toolChoice) &&
      toolChoice.type === 'function' &&
      isRecord(toolChoice.function) &&
      typeof toolChoice.function.name === 'string' &&
      toolChoice.function.name.length > 0
    ) {
      return {
        type: 'function',
        function: {
          name: toolChoice.function.name,
        },
      };
    }

    throw new ValidationError(
      'Invalid tool choice configuration',
      this.correlationId,
      'tool_choice',
      toolChoice
    );
  }

  /**
   * Validate response format configuration
   */
  private validateResponseFormat(
    responseFormat: unknown
  ): ResponseFormat | undefined {
    if (responseFormat === undefined) {
      return undefined;
    }

    if (!isRecord(responseFormat)) {
      throw new ValidationError(
        'response_format must be an object',
        this.correlationId,
        'response_format',
        responseFormat
      );
    }

    const typeValue = responseFormat.type;
    if (typeValue === 'text' || typeValue === 'json_object') {
      return { type: typeValue };
    }

    // Default to text for unknown response format types instead of throwing
    return { type: 'text' };
  }

  /**
   * Transform OpenAI messages to Responses API format
   */
  private transformMessages(
    messages: readonly DeepReadonly<OpenAIMessage>[]
  ): readonly ResponseMessage[] {
    const transformedMessages: ResponseMessage[] = [];

    for (const message of messages) {
      if (message.role === 'tool') {
        const content = message.content ?? '';
        const toolCallId = message.tool_call_id ?? 'unknown_tool_call';
        transformedMessages.push({
          role: 'user',
          content: `[Tool Result for ${toolCallId}]: ${content}`,
        });
        continue;
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length > 0) {
        const baseContent = message.content ?? '';
        const toolCallsText = toolCalls
          .map(
            (toolCall) =>
              `[Tool Call: ${toolCall.function.name}(${toolCall.function.arguments})]`
          )
          .join('\n');
        const combinedContent =
          baseContent.length > 0
            ? `${baseContent}\n${toolCallsText}`
            : toolCallsText;

        transformedMessages.push({
          role: message.role,
          content: combinedContent,
        });
        continue;
      }

      transformedMessages.push({
        role: message.role,
        content: message.content ?? '',
      });
    }

    return transformedMessages;
  }

  /**
   * Convert messages to input format for Responses API
   */
  private convertMessagesToInput(
    messages: readonly DeepReadonly<ResponseMessage>[]
  ): string | readonly ResponseMessage[] {
    if (messages.length === 1) {
      const [singleMessage] = messages;
      if (singleMessage?.role === 'user') {
        return singleMessage.content;
      }
    }

    return messages;
  }

  /**
   * Transform OpenAI tools to Responses API format
   */
  private transformTools(
    openaiTools: readonly DeepReadonly<OpenAIToolDefinition>[]
  ): readonly import('../types/index.js').ResponsesTool[] {
    return openaiTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  /**
   * Transform OpenAI tool choice to Responses API format
   */
  private transformToolChoice(
    openaiToolChoice: DeepReadonly<ToolChoice>
  ): ResponsesCreateParams['tool_choice'] {
    if (openaiToolChoice === 'auto') {
      return 'auto';
    }

    if (openaiToolChoice === 'none') {
      return 'none';
    }

    const toolChoiceObject = openaiToolChoice as Extract<
      ToolChoice,
      {
        readonly type: 'function';
        readonly function: { readonly name: string };
      }
    >;

    const functionDescriptor = toolChoiceObject.function;
    if (
      !isRecord(functionDescriptor) ||
      typeof functionDescriptor.name !== 'string'
    ) {
      return 'auto';
    }

    return {
      type: 'function',
      function: {
        name: functionDescriptor.name,
      },
    };
  }

  /**
   * Transform OpenAI response format to Responses API format
   */
  private transformResponseFormat(
    openaiResponseFormat: ResponseFormat
  ): ResponsesCreateParams['response_format'] {
    if (openaiResponseFormat === undefined) {
      return undefined;
    }

    switch (openaiResponseFormat.type) {
      case 'text':
        return { type: 'text' };
      case 'json_object':
        return { type: 'json_object' };
      default:
        return { type: 'text' };
    }
  }

  /**
   * Generate conversation ID from request context
   */
  public generateConversationId(request: DeepReadonly<OpenAIRequest>): string {
    const firstUserMessage = request.messages.find(
      (message) => message.role === 'user'
    );

    if (firstUserMessage !== undefined) {
      const content = firstUserMessage.content ?? '';
      if (content.length > 0) {
        const hash = content.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '');
        if (hash.length > 0) {
          return `conv_${hash}_${Date.now()}`;
        }
      }
    }

    return `conv_${uuidv4()}`;
  }

  /**
   * Estimate conversation complexity for reasoning effort adjustment
   */
  public estimateConversationComplexity(
    request: DeepReadonly<OpenAIRequest>,
    context?: DeepReadonly<ConversationContext>
  ): 'simple' | 'medium' | 'complex' {
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';

    const messageCount = request.messages.length;
    if (messageCount > 10) {
      complexity = 'complex';
    } else if (messageCount > 3) {
      complexity = 'medium';
    }

    if (request.tools !== undefined && request.tools.length > 0) {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
    }

    const hasToolCalls = request.messages.some(
      (message) =>
        message.tool_calls !== undefined && message.tool_calls.length > 0
    );
    if (hasToolCalls) {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
    }

    const totalContentLength = request.messages.reduce((total, message) => {
      const content = message.content ?? '';
      return total + content.length;
    }, 0);

    if (totalContentLength > 10000) {
      complexity = 'complex';
    } else if (totalContentLength > 2000 && complexity === 'simple') {
      complexity = 'medium';
    }

    if (context !== undefined) {
      if (context.messageCount > 20) {
        complexity = 'complex';
      } else if (context.messageCount > 5 && complexity === 'simple') {
        complexity = 'medium';
      }
    }

    return complexity;
  }

  /**
   * Detect if request contains Swift/iOS development content
   */
  public detectSwiftIOSContent(request: DeepReadonly<OpenAIRequest>): boolean {
    const swiftKeywords = [
      'swift',
      'ios',
      'xcode',
      'uikit',
      'swiftui',
      'foundation',
      'cocoa',
      'objective-c',
      'appkit',
      'core data',
      'combine',
      'async/await',
      'actor',
      '@main',
      'import UIKit',
      'import SwiftUI',
    ];

    const iosKeywords = [
      'iphone',
      'ipad',
      'watchos',
      'tvos',
      'macos',
      'app store',
      'testflight',
      'provisioning',
      'certificate',
      'bundle identifier',
    ];

    const allKeywords = [...swiftKeywords, ...iosKeywords];

    return request.messages.some((message) => {
      const content = (message.content ?? '').toLowerCase();
      return allKeywords.some((keyword) =>
        content.includes(keyword.toLowerCase())
      );
    });
  }
}

/**
 * Factory function to create transformer instance
 */
export function createOpenAIToResponsesTransformer(
  correlationId: string
): OpenAIToResponsesTransformer {
  return new OpenAIToResponsesTransformer(correlationId);
}

/**
 * Utility function for quick transformation
 */
export function transformOpenAIToResponses(
  openaiRequest: unknown,
  correlationId: string,
  reasoningEffort: ReasoningEffort = 'medium',
  conversationContext?: Readonly<ConversationContext>
): ResponsesCreateParams {
  const transformer = createOpenAIToResponsesTransformer(correlationId);
  return transformer.transformRequest(
    openaiRequest,
    reasoningEffort,
    conversationContext
  );
}
