/**
 * Context Management Hook
 *
 * Provides context usage monitoring, extension, and compression helpers
 * that wrap the shared `ContextService`. Handles warning state and exposes
 * convenience utilities for consumers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Conversation,
  CompressionEvent,
  ContextUsage,
  Message,
} from '../types/index.js';
import { ContextService } from '../services/context.js';
import { getModelService, modelUtils } from '../services/models.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Internal state maintained by the hook.
 */
interface ContextManagementState {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly showWarning: boolean;
  readonly compressionInProgress: boolean;
  readonly extensionInProgress: boolean;
}

/**
 * Context compression options exposed to consumers and reused by the service.
 */
export interface CompressionOptions {
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
  readonly targetReduction: number;
  readonly preserveCodeBlocks: boolean;
  readonly preserveRecentMessages: number;
}

interface ContextExtensionResult {
  readonly success: boolean;
  readonly newMaxTokens: number;
  readonly error?: string;
}

interface CompressionResult {
  readonly compressedContext: string;
  readonly compressionEvent: CompressionEvent;
  readonly estimatedTokens: number;
  readonly compressionRatio: number;
}

export interface UseContextManagementReturn {
  readonly contextUsage: ContextUsage;
  readonly state: ContextManagementState;
  readonly calculateContextUsage: (
    messages: Message[],
    modelId: string
  ) => ContextUsage;
  readonly shouldWarnAboutContext: (usage: ContextUsage) => boolean;
  readonly getContextWarningLevel: (
    usage: ContextUsage
  ) => 'none' | 'warning' | 'critical';
  readonly canExtendContext: (modelId: string) => boolean;
  readonly extendContext: () => Promise<ContextExtensionResult>;
  readonly compressConversation: (
    options?: Partial<CompressionOptions>
  ) => Promise<CompressionResult>;
  readonly createCompressedConversation: (
    compressedContext: string,
    originalConversationId: string
  ) => Promise<string>;
  readonly showContextWarning: boolean;
  readonly setShowContextWarning: (show: boolean) => void;
  readonly dismissWarning: () => void;
  readonly estimateMessageTokens: (message: Message) => number;
  readonly getContextUsagePercentage: (usage: ContextUsage) => number;
  readonly formatTokenCount: (tokens: number) => string;
}

const DEFAULT_COMPRESSION_OPTIONS: CompressionOptions = {
  method: 'ai-summary',
  targetReduction: 0.5,
  preserveCodeBlocks: true,
  preserveRecentMessages: 3,
};

const MODEL_CONTEXT_INFO: Record<
  string,
  {
    readonly baseLimit: number;
    readonly extendedLimit?: number;
    readonly canExtend: boolean;
  }
> = {
  'qwen-3-coder': {
    baseLimit: 256000,
    extendedLimit: 1000000,
    canExtend: true,
  },
  'qwen.qwen3-coder-480b-a35b-v1:0': {
    baseLimit: 256000,
    extendedLimit: 1000000,
    canExtend: true,
  },
  'gpt-4': {
    baseLimit: 128000,
    canExtend: false,
  },
  'gpt-5-codex': {
    baseLimit: 128000,
    canExtend: false,
  },
};

const WARNING_THRESHOLD_PERCENT = 80;
const CRITICAL_THRESHOLD_PERCENT = 95;

/**
 * Resolve context limits for a model using static data backed by the model service.
 */
const resolveModelLimits = async (
  modelId: string
): Promise<{
  baseLimit: number;
  extendedLimit?: number;
  canExtend: boolean;
}> => {
  const entry = MODEL_CONTEXT_INFO[modelId];
  if (entry) {
    return entry;
  }

  const modelService = getModelService();
  try {
    const model = await modelService.getModelById(modelId);
    if (model) {
      return {
        baseLimit: model.contextLength,
        extendedLimit: undefined,
        canExtend: model.capabilities.includes('context-extension'),
      };
    }
  } catch (error) {
    frontendLogger.warn('Failed to resolve model limits from service', {
      metadata: { modelId },
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }

  return {
    baseLimit: 128000,
    canExtend: false,
  };
};

const buildInitialState = (): ContextManagementState => ({
  isLoading: false,
  error: null,
  showWarning: false,
  compressionInProgress: false,
  extensionInProgress: false,
});

export function useContextManagement(
  conversation: Conversation
): UseContextManagementReturn {
  const contextServiceRef = useRef(ContextService.getInstance());
  const [state, setState] = useState<ContextManagementState>(buildInitialState);
  const [modelLimitsCache, setModelLimitsCache] = useState<
    Record<
      string,
      { baseLimit: number; extendedLimit?: number; canExtend: boolean }
    >
  >({});
  const [showContextWarning, setShowContextWarning] = useState<boolean>(false);

  const updateState = useCallback(
    (updates: Partial<ContextManagementState>): void => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const handleError = useCallback(
    (error: unknown, operation: string): Error => {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(
              typeof error === 'string' ? error : `${operation} failed`
            );

      frontendLogger.error(`Context management ${operation} error`, {
        error: normalizedError,
        metadata: { conversationId: conversation.id, operation },
      });

      setState((prev) => ({
        ...prev,
        error: normalizedError.message,
        isLoading: false,
        compressionInProgress: false,
        extensionInProgress: false,
      }));

      return normalizedError;
    },
    [conversation.id]
  );

  const ensureModelLimits = useCallback(
    async (
      modelId: string
    ): Promise<{
      baseLimit: number;
      extendedLimit?: number;
      canExtend: boolean;
    }> => {
      if (modelLimitsCache[modelId]) {
        return modelLimitsCache[modelId];
      }

      const limits = await resolveModelLimits(modelId);
      setModelLimitsCache((prev) => ({ ...prev, [modelId]: limits }));
      return limits;
    },
    [modelLimitsCache]
  );

  const estimateMessageTokens = useCallback((message: Message): number => {
    let total = modelUtils.estimateTokens(message.content);

    if (message.files) {
      total += message.files.reduce((sum, file) => {
        if (file.type?.startsWith('image/')) {
          return sum + 1000;
        }
        return sum + Math.ceil((file.size ?? 0) / 4);
      }, 0);
    }

    if (message.codeBlocks) {
      total += message.codeBlocks.reduce(
        (sum, block) => sum + modelUtils.estimateTokens(block.code),
        0
      );
    }

    return total;
  }, []);

  const calculateContextUsage = useCallback(
    (messages: Message[], modelId: string): ContextUsage => {
      const cachedLimits =
        modelLimitsCache[modelId] ?? MODEL_CONTEXT_INFO[modelId];
      const baseLimit =
        cachedLimits?.baseLimit ??
        conversation.contextUsage?.maxTokens ??
        128000;
      const extendedLimit = cachedLimits?.extendedLimit;
      const canExtend = cachedLimits?.canExtend ?? false;

      const currentTokens = messages.reduce(
        (sum, message) => sum + estimateMessageTokens(message),
        0
      );
      const isExtended = conversation.contextUsage?.isExtended ?? false;
      const maxTokens = isExtended && extendedLimit ? extendedLimit : baseLimit;

      return {
        currentTokens,
        maxTokens,
        warningThreshold: WARNING_THRESHOLD_PERCENT,
        canExtend,
        extendedMaxTokens: extendedLimit,
        isExtended,
      };
    },
    [conversation.contextUsage, estimateMessageTokens, modelLimitsCache]
  );

  const contextUsage = useMemo(() => {
    return calculateContextUsage(
      conversation.messages,
      conversation.selectedModel
    );
  }, [
    calculateContextUsage,
    conversation.messages,
    conversation.selectedModel,
  ]);

  const shouldWarnAboutContext = useCallback((usage: ContextUsage): boolean => {
    return (
      (usage.currentTokens / usage.maxTokens) * 100 >= usage.warningThreshold
    );
  }, []);

  const getContextWarningLevel = useCallback(
    (usage: ContextUsage): 'none' | 'warning' | 'critical' => {
      const percentage = (usage.currentTokens / usage.maxTokens) * 100;
      if (percentage >= CRITICAL_THRESHOLD_PERCENT) {
        return 'critical';
      }
      if (percentage >= usage.warningThreshold) {
        return 'warning';
      }
      return 'none';
    },
    []
  );

  const canExtendContext = useCallback(
    (modelId: string): boolean => {
      if (modelLimitsCache[modelId]?.canExtend) {
        return true;
      }
      return contextServiceRef.current.canModelExtendContext(modelId);
    },
    [modelLimitsCache]
  );

  const extendContext =
    useCallback(async (): Promise<ContextExtensionResult> => {
      updateState({ extensionInProgress: true, error: null });

      try {
        const response = await contextServiceRef.current.extendContext(
          conversation.id
        );
        setModelLimitsCache((prev) => ({
          ...prev,
          [conversation.selectedModel]: {
            baseLimit: response.previousMaxTokens,
            extendedLimit: response.extendedMaxTokens,
            canExtend: true,
          },
        }));

        updateState({ extensionInProgress: false });

        return {
          success: response.success,
          newMaxTokens: response.extendedMaxTokens,
        };
      } catch (error) {
        const normalized = handleError(error, 'extend-context');
        updateState({ extensionInProgress: false });
        return {
          success: false,
          newMaxTokens: contextUsage.maxTokens,
          error: normalized.message,
        };
      }
    }, [
      conversation.id,
      conversation.selectedModel,
      contextUsage.maxTokens,
      handleError,
      updateState,
    ]);

  const compressConversation = useCallback(
    async (
      options: Partial<CompressionOptions> = {}
    ): Promise<CompressionResult> => {
      const compressionOptions: CompressionOptions = {
        ...DEFAULT_COMPRESSION_OPTIONS,
        ...options,
      };

      updateState({ compressionInProgress: true, error: null });

      try {
        const response = await contextServiceRef.current.compressConversation(
          conversation.id,
          compressionOptions
        );

        updateState({ compressionInProgress: false });

        return {
          compressedContext: response.compressedContext,
          compressionEvent: response.compressionEvent,
          estimatedTokens: response.compressedTokens,
          compressionRatio: response.compressionRatio,
        };
      } catch (error) {
        updateState({ compressionInProgress: false });
        throw handleError(error, 'compress-conversation');
      }
    },
    [conversation.id, handleError, updateState]
  );

  const createCompressedConversation = useCallback(
    async (
      compressedContext: string,
      originalConversationId: string
    ): Promise<string> => {
      updateState({ isLoading: true, error: null });

      try {
        const response =
          await contextServiceRef.current.createCompressedConversation(
            originalConversationId,
            compressedContext,
            `${conversation.title} (Compressed)`
          );

        updateState({ isLoading: false });
        return response.newConversationId;
      } catch (error) {
        updateState({ isLoading: false });
        throw handleError(error, 'create-compressed-conversation');
      }
    },
    [conversation.title, handleError, updateState]
  );

  const dismissWarning = useCallback((): void => {
    setShowContextWarning(false);
    updateState({ showWarning: false });
  }, [updateState]);

  const getContextUsagePercentage = useCallback(
    (usage: ContextUsage): number => {
      if (usage.maxTokens === 0) {
        return 0;
      }
      return Math.round((usage.currentTokens / usage.maxTokens) * 100);
    },
    []
  );

  const formatTokenCount = useCallback((tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  }, []);

  useEffect(() => {
    const warningLevel = getContextWarningLevel(contextUsage);
    const shouldDisplay = warningLevel !== 'none' && !showContextWarning;

    if (shouldDisplay) {
      setShowContextWarning(true);
      updateState({ showWarning: true });
    }
  }, [contextUsage, getContextWarningLevel, showContextWarning, updateState]);

  useEffect(() => {
    void ensureModelLimits(conversation.selectedModel);
  }, [conversation.selectedModel, ensureModelLimits]);

  return {
    contextUsage,
    state,
    calculateContextUsage,
    shouldWarnAboutContext,
    getContextWarningLevel,
    canExtendContext,
    extendContext,
    compressConversation,
    createCompressedConversation,
    showContextWarning,
    setShowContextWarning,
    dismissWarning,
    estimateMessageTokens,
    getContextUsagePercentage,
    formatTokenCount,
  };
}

export function useContextCompression(conversation: Conversation) {
  const { compressConversation, createCompressedConversation, state } =
    useContextManagement(conversation);

  const [compressionResult, setCompressionResult] =
    useState<CompressionResult | null>(null);
  const [showCompressionDialog, setShowCompressionDialog] = useState(false);

  const startCompression = useCallback(
    async (options?: Partial<CompressionOptions>) => {
      try {
        const result = await compressConversation(options);
        setCompressionResult(result);
        setShowCompressionDialog(true);
      } catch (error) {
        frontendLogger.error('Compression workflow failed', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { conversationId: conversation.id },
        });
      }
    },
    [compressConversation, conversation.id]
  );

  const confirmCompression = useCallback(async (): Promise<string | null> => {
    if (!compressionResult) {
      return null;
    }

    try {
      const newConversationId = await createCompressedConversation(
        compressionResult.compressedContext,
        conversation.id
      );
      setCompressionResult(null);
      setShowCompressionDialog(false);
      return newConversationId;
    } catch (error) {
      frontendLogger.error('Failed to create compressed conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { conversationId: conversation.id },
      });
      return null;
    }
  }, [compressionResult, createCompressedConversation, conversation.id]);

  const cancelCompression = useCallback((): void => {
    setCompressionResult(null);
    setShowCompressionDialog(false);
  }, []);

  return {
    compressionResult,
    showCompressionDialog,
    isCompressing: state.compressionInProgress,
    startCompression,
    confirmCompression,
    cancelCompression,
  };
}
