import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeRequest,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeToolDefinition,
  ResponsesCreateParams,
  ResponseMessage,
  ReasoningEffort,
  ConversationContext,
} from '../types/index';
import { ValidationError } from '../errors/index';

type UnknownRecord = Record<string, unknown>;
type ToolChoice = ClaudeRequest['tool_choice'];

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
 * Transforms Claude API requests to Azure OpenAI Responses API format
 * Handles message transformation, parameter mapping, and conversation context
 */
export class ClaudeToResponsesTransformer {
  private readonly correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  /**
   * Transform Claude request to Responses API format
   */
  public transformRequest(
    claudeRequestInput: unknown,
    reasoningEffort: ReasoningEffort = 'medium',
    conversationContext?: Readonly<ConversationContext>
  ): ResponsesCreateParams {
    const claudeRequest = this.validateClaudeRequest(claudeRequestInput);

    const messages = this.transformMessages(
      claudeRequest.messages,
      claudeRequest.system
    );
    const input = this.convertMessagesToInput(messages);

    const params: ResponsesCreateParams = {
      model: claudeRequest.model,
      input,
      reasoning: {
        effort: reasoningEffort,
      },
    };

    if (claudeRequest.max_tokens !== undefined) {
      (params as { max_output_tokens: number }).max_output_tokens =
        claudeRequest.max_tokens;
    }

    if (claudeRequest.temperature !== undefined) {
      (params as { temperature: number }).temperature =
        claudeRequest.temperature;
    }

    if (claudeRequest.top_p !== undefined) {
      (params as { top_p: number }).top_p = claudeRequest.top_p;
    }

    if (claudeRequest.stream !== undefined) {
      (params as { stream: boolean }).stream = claudeRequest.stream;
    }

    if (
      Array.isArray(claudeRequest.stop_sequences) &&
      claudeRequest.stop_sequences.length > 0
    ) {
      (params as { stop: readonly string[] }).stop =
        claudeRequest.stop_sequences;
    }

    if (
      conversationContext !== undefined &&
      typeof conversationContext.previousResponseId === 'string' &&
      conversationContext.previousResponseId.length > 0
    ) {
      (params as { previous_response_id: string }).previous_response_id =
        conversationContext.previousResponseId;
    }

    if (claudeRequest.tools !== undefined && claudeRequest.tools.length > 0) {
      (
        params as {
          tools: readonly import('../types/index.js').ResponsesTool[];
        }
      ).tools = this.transformTools(claudeRequest.tools);
    }

    if (claudeRequest.tool_choice !== undefined) {
      const transformedToolChoice = this.transformToolChoice(
        claudeRequest.tool_choice
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

    return params;
  }

  /**
   * Validate Claude request structure and return a sanitized request
   */
  private validateClaudeRequest(request: unknown): ClaudeRequest {
    if (!isRecord(request)) {
      throw new ValidationError(
        'Claude request must be an object',
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
      this.validateClaudeMessage(message, index)
    ) as readonly ClaudeMessage[];

    const optionalFields: {
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
      system?: string;
      tools?: readonly ClaudeToolDefinition[];
      tool_choice?: ToolChoice;
      stop_sequences?: readonly string[];
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

    if ('system' in requestRecord && requestRecord.system !== undefined) {
      const systemValue = requestRecord.system;
      if (typeof systemValue !== 'string') {
        throw new ValidationError(
          'system must be a string',
          this.correlationId,
          'system',
          systemValue
        );
      }
      optionalFields.system = systemValue;
    }

    if (
      'stop_sequences' in requestRecord &&
      requestRecord.stop_sequences !== undefined
    ) {
      const stopSequencesValue = requestRecord.stop_sequences;
      if (!Array.isArray(stopSequencesValue)) {
        throw new ValidationError(
          'stop_sequences must be an array of strings',
          this.correlationId,
          'stop_sequences',
          stopSequencesValue
        );
      }

      const sanitizedStops = stopSequencesValue.map((entry, index) => {
        if (typeof entry !== 'string' || entry.length === 0) {
          throw new ValidationError(
            `stop_sequences[${index}] must be a non-empty string`,
            this.correlationId,
            `stop_sequences[${index}]`,
            entry
          );
        }
        return entry;
      });

      optionalFields.stop_sequences = sanitizedStops;
    }

    if ('tools' in requestRecord && requestRecord.tools !== undefined) {
      optionalFields.tools = this.validateClaudeTools(requestRecord.tools);
    }

    if (
      'tool_choice' in requestRecord &&
      requestRecord.tool_choice !== undefined
    ) {
      optionalFields.tool_choice = this.validateToolChoice(
        requestRecord.tool_choice
      );
    }

    // Content security validation is now handled by UniversalRequestProcessor
    // to allow for configurable validation based on use case (development vs production)
    // if (
    //   typeof optionalFields.system === 'string' &&
    //   this.containsMaliciousContent(optionalFields.system)
    // ) {
    //   throw new ValidationError(
    //     'System message contains potentially harmful content',
    //     this.correlationId,
    //     'system',
    //     '[REDACTED]'
    //   );
    // }

    return {
      model: modelValue,
      messages,
      ...optionalFields,
    };
  }

  /**
   * Validate individual Claude message
   */
  private validateClaudeMessage(
    message: unknown,
    index: number
  ): ClaudeMessage {
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
      roleValue !== 'system'
    ) {
      throw new ValidationError(
        `Invalid message role at index ${index}`,
        this.correlationId,
        `messages[${index}].role`,
        roleValue
      );
    }

    let contentValue = message.content;
    if (typeof contentValue === 'string') {
      if (contentValue.length === 0) {
        // Provide default content instead of throwing error
        contentValue = '[Content was sanitized and removed for security]';
      }

      // Content security validation is now handled by UniversalRequestProcessor
      // if (this.containsMaliciousContent(contentValue)) {
      //   throw new ValidationError(
      //     `Message content contains potentially harmful content at index ${index}`,
      //     this.correlationId,
      //     `messages[${index}].content`,
      //     '[REDACTED]'
      //   );
      // }

      return {
        role: roleValue,
        content: contentValue as string,
      };
    }

    if (Array.isArray(contentValue) && contentValue.length > 0) {
      const blocks = contentValue.map((block, blockIndex) =>
        this.validateContentBlock(block, index, blockIndex)
      ) as readonly ClaudeContentBlock[];

      return {
        role: roleValue,
        content: blocks,
      };
    }

    throw new ValidationError(
      `Message content must be string or array at index ${index}`,
      this.correlationId,
      `messages[${index}].content`,
      contentValue
    );
  }

  /**
   * Validate Claude content block
   */
  private validateContentBlock(
    block: unknown,
    messageIndex: number,
    blockIndex: number
  ): ClaudeContentBlock {
    if (!isRecord(block)) {
      throw new ValidationError(
        `Content block must be an object at message ${messageIndex}, block ${blockIndex}`,
        this.correlationId,
        `messages[${messageIndex}].content[${blockIndex}]`,
        block
      );
    }

    const typeValue = block.type;
    if (
      typeValue !== 'text' &&
      typeValue !== 'image' &&
      typeValue !== 'tool_use' &&
      typeValue !== 'tool_result'
    ) {
      throw new ValidationError(
        `Invalid content block type at message ${messageIndex}, block ${blockIndex}`,
        this.correlationId,
        `messages[${messageIndex}].content[${blockIndex}].type`,
        typeValue
      );
    }

    // Handle text blocks with special validation
    if (typeValue === 'text') {
      // If text is not a string, provide a default message instead of throwing error
      if (typeof block.text !== 'string') {
        (block as { text: string }).text =
          '[Content was processed and converted to text]';
      } else if (block.text.trim().length === 0) {
        // If text block is empty after sanitization, provide a default message
        (block as { text: string }).text =
          '[Content was sanitized and removed for security]';
      }
    }

    // Content security validation is now handled by UniversalRequestProcessor
    // if (
    //   typeValue === 'text' &&
    //   typeof block.text === 'string' &&
    //   this.containsMaliciousContent(block.text)
    // ) {
    //   throw new ValidationError(
    //     `Text content contains potentially harmful content at message ${messageIndex}, block ${blockIndex}`,
    //     this.correlationId,
    //     `messages[${messageIndex}].content[${blockIndex}].text`,
    //     '[REDACTED]'
    //   );
    // }

    return block as unknown as ClaudeContentBlock;
  }

  /**
   * Validate Claude tool definitions
   */
  private validateClaudeTools(tools: unknown): readonly ClaudeToolDefinition[] {
    if (!Array.isArray(tools)) {
      throw new ValidationError(
        'tools must be an array when provided',
        this.correlationId,
        'tools',
        tools
      );
    }

    const sanitizedTools: ClaudeToolDefinition[] = [];

    tools.forEach((tool, index) => {
      if (!isRecord(tool)) {
        throw new ValidationError(
          `Tool definition must be an object at index ${index}`,
          this.correlationId,
          `tools[${index}]`,
          tool
        );
      }

      if (typeof tool.name !== 'string' || tool.name.length === 0) {
        throw new ValidationError(
          `Tool name is required at index ${index}`,
          this.correlationId,
          `tools[${index}].name`,
          tool.name
        );
      }

      if (
        typeof tool.description !== 'string' ||
        tool.description.length === 0
      ) {
        throw new ValidationError(
          `Tool description is required at index ${index}`,
          this.correlationId,
          `tools[${index}].description`,
          tool.description
        );
      }

      if (!isRecord(tool.input_schema)) {
        throw new ValidationError(
          `Tool input_schema must be an object at index ${index}`,
          this.correlationId,
          `tools[${index}].input_schema`,
          tool.input_schema
        );
      }

      sanitizedTools.push(tool as unknown as ClaudeToolDefinition);
    });

    return sanitizedTools as readonly ClaudeToolDefinition[];
  }

  /**
   * Validate tool choice structure
   */
  private validateToolChoice(toolChoice: unknown): ToolChoice | undefined {
    if (toolChoice === undefined) {
      return undefined;
    }

    if (toolChoice === 'auto' || toolChoice === 'any') {
      return toolChoice;
    }

    if (
      isRecord(toolChoice) &&
      toolChoice.type === 'tool' &&
      typeof toolChoice.name === 'string' &&
      toolChoice.name.length > 0
    ) {
      return {
        type: 'tool',
        name: toolChoice.name,
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
   * Transform Claude messages to Responses API format
   */
  private transformMessages(
    messages: readonly DeepReadonly<ClaudeMessage>[],
    systemMessage?: string
  ): readonly ResponseMessage[] {
    const transformedMessages: ResponseMessage[] = [];

    const hasSystemMessage =
      typeof systemMessage === 'string' && systemMessage.length > 0;

    if (hasSystemMessage) {
      transformedMessages.push({
        role: 'system',
        content: systemMessage,
      });
    }

    for (const message of messages) {
      if (message.role === 'system' && hasSystemMessage) {
        continue;
      }

      const content = this.extractTextContent(message.content);
      transformedMessages.push({
        role: message.role,
        content,
      });
    }

    return transformedMessages;
  }

  private containsMaliciousContent(value: string): boolean {
    const patterns: readonly RegExp[] = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /(?:^|\s)javascript:\s*/i, // More specific - only match javascript: protocol at start or after whitespace
      /data:text\//i,
      /\s+on(click|load|error|focus|blur|change|submit|keydown|keyup|mouseover|mouseout)\s*=/i, // HTML event handlers only
      // More specific template injection patterns that are actually malicious
      /\{\{\s*(constructor|__proto__|prototype)\s*\}\}/i,
      /\{\{\s*.*\s*(eval|Function|require|import|process|global)\s*.*\s*\}\}/i,
    ];

    return patterns.some((pattern) => pattern.test(value));
  }

  /**
   * Extract text content from Claude content (string or content blocks)
   */
  private extractTextContent(
    content: DeepReadonly<ClaudeMessage>['content']
  ): string {
    if (typeof content === 'string') {
      return content;
    }

    const textParts: string[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        if (typeof block.text === 'string' && block.text.length > 0) {
          textParts.push(block.text);
        }
      } else if (block.type === 'tool_use') {
        const toolName =
          typeof block.name === 'string' && block.name.length > 0
            ? block.name
            : 'tool';
        textParts.push(`[Tool Use: ${toolName}]`);
      } else if (block.type === 'tool_result') {
        if (typeof block.content === 'string') {
          textParts.push(`[Tool Result: ${block.content}]`);
        } else if (Array.isArray(block.content)) {
          const resultBlocks = block.content as readonly ClaudeContentBlock[];
          const resultText = resultBlocks
            .filter(
              (
                resultBlock
              ): resultBlock is ClaudeContentBlock & {
                readonly type: 'text';
                readonly text?: string;
              } =>
                resultBlock.type === 'text' &&
                typeof resultBlock.text === 'string'
            )
            .map((resultBlock) => resultBlock.text ?? '')
            .join('\n');

          if (resultText.length > 0) {
            textParts.push(`[Tool Result: ${resultText}]`);
          }
        }
      }
    }

    return textParts.join('\n');
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
   * Transform Claude tools to Responses API format
   */
  private transformTools(
    claudeTools: readonly DeepReadonly<ClaudeToolDefinition>[]
  ): readonly import('../types/index.js').ResponsesTool[] {
    return claudeTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  /**
   * Transform Claude tool choice to Responses API format
   */
  private transformToolChoice(
    claudeToolChoice: DeepReadonly<ToolChoice>
  ): ResponsesCreateParams['tool_choice'] {
    if (claudeToolChoice === 'auto') {
      return 'auto';
    }

    if (claudeToolChoice === 'any') {
      return 'auto';
    }

    const toolChoiceObject = claudeToolChoice as Extract<
      ToolChoice,
      { readonly type: 'tool'; readonly name: string }
    >;
    return {
      type: 'function',
      function: {
        name: toolChoiceObject.name,
      },
    };
  }

  /**
   * Generate conversation ID from request context
   */
  public generateConversationId(request: DeepReadonly<ClaudeRequest>): string {
    const firstUserMessage = request.messages.find(
      (message) => message.role === 'user'
    );

    const firstUserContent =
      firstUserMessage !== undefined
        ? this.extractTextContent(firstUserMessage.content)
        : '';

    if (firstUserContent.length > 0) {
      const hash = firstUserContent.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '');
      if (hash.length > 0) {
        return `conv_${hash}_${Date.now()}`;
      }
    }

    return `conv_${uuidv4()}`;
  }

  /**
   * Estimate conversation complexity for reasoning effort adjustment
   */
  public estimateConversationComplexity(
    request: DeepReadonly<ClaudeRequest>,
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

    const totalContentLength = request.messages.reduce((total, message) => {
      const textContent = this.extractTextContent(message.content);
      return total + textContent.length;
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
}

/**
 * Factory function to create transformer instance
 */
export function createClaudeToResponsesTransformer(
  correlationId: string
): ClaudeToResponsesTransformer {
  return new ClaudeToResponsesTransformer(correlationId);
}

/**
 * Utility function for quick transformation
 */
export function transformClaudeToResponses(
  claudeRequest: unknown,
  correlationId: string,
  reasoningEffort: ReasoningEffort = 'medium',
  conversationContext?: Readonly<ConversationContext>
): ResponsesCreateParams {
  const transformer = createClaudeToResponsesTransformer(correlationId);
  return transformer.transformRequest(
    claudeRequest,
    reasoningEffort,
    conversationContext
  );
}
