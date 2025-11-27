import React, {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { JSX } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/themes/prism-dark.css';
import { useI18n } from '../../contexts/I18nContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import type { Message, CodeBlock } from '../../types/index.js';
import { frontendLogger } from '../../utils/logger.js';
import { cn } from '../ui/Glass.js';

// Dynamically load Prism language components to avoid initialization errors
const loadedLanguages = new Set<string>();

async function loadPrismLanguage(language: string): Promise<void> {
  if (loadedLanguages.has(language)) {
    return;
  }

  try {
    switch (language) {
      case 'javascript':
      case 'js':
        await import('prismjs/components/prism-javascript');
        break;
      case 'typescript':
      case 'ts':
        await import('prismjs/components/prism-typescript');
        break;
      case 'python':
      case 'py':
        await import('prismjs/components/prism-python');
        break;
      case 'java':
        await import('prismjs/components/prism-java');
        break;
      case 'cpp':
      case 'c++':
        await import('prismjs/components/prism-c');
        await import('prismjs/components/prism-cpp');
        break;
      case 'csharp':
      case 'cs':
        await import('prismjs/components/prism-csharp');
        break;
      case 'go':
        await import('prismjs/components/prism-go');
        break;
      case 'rust':
      case 'rs':
        await import('prismjs/components/prism-rust');
        break;
      case 'php':
        await import('prismjs/components/prism-php');
        break;
      case 'ruby':
      case 'rb':
        await import('prismjs/components/prism-ruby');
        break;
      case 'swift':
        await import('prismjs/components/prism-swift');
        break;
      case 'kotlin':
      case 'kt':
        await import('prismjs/components/prism-kotlin');
        break;
      case 'scala':
        await import('prismjs/components/prism-scala');
        break;
      case 'json':
        await import('prismjs/components/prism-json');
        break;
      case 'yaml':
      case 'yml':
        await import('prismjs/components/prism-yaml');
        break;
      case 'markdown':
      case 'md':
        await import('prismjs/components/prism-markdown');
        break;
      case 'bash':
      case 'sh':
        await import('prismjs/components/prism-bash');
        break;
      case 'sql':
        await import('prismjs/components/prism-sql');
        break;
      default:
        // Language not supported, will use plain text
        break;
    }
    loadedLanguages.add(language);
  } catch (error) {
    frontendLogger.warn('Failed to load Prism language', {
      metadata: {
        language,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

interface MessageItemProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
  readonly onCopyCode?: (code: string) => void;
  readonly onRetryMessage?: (messageId: string) => void;
  readonly highlightKeywords?: string[]; // Task 6.4: Keywords to highlight (Requirement 8.4)
}

type MessageSegment =
  | { readonly type: 'text'; readonly id: string; readonly text: string }
  | {
      readonly type: 'code';
      readonly id: string;
      readonly code: string;
      readonly languageHint?: string;
      readonly filename?: string;
      readonly startLine?: number;
    };

interface CodeBlockViewProps {
  readonly blockId: string;
  readonly code: string;
  readonly languageHint?: string;
  readonly filename?: string;
  readonly startLine?: number;
  readonly theme: 'light' | 'dark';
  readonly onCopy: (code: string, codeId: string) => void;
  readonly isCopied: boolean;
}

const KNOWN_LANGUAGES = new Set<string>([
  'bash',
  'c',
  'cpp',
  'csharp',
  'go',
  'java',
  'javascript',
  'json',
  'kotlin',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'sql',
  'swift',
  'typescript',
  'yaml',
  'text',
  'html',
  'css',
]);

const EXTENSION_LANGUAGE_MAP = new Map<string, string>([
  ['sh', 'bash'],
  ['bash', 'bash'],
  ['zsh', 'bash'],
  ['c', 'c'],
  ['h', 'c'],
  ['cpp', 'cpp'],
  ['cxx', 'cpp'],
  ['cc', 'cpp'],
  ['hpp', 'cpp'],
  ['cs', 'csharp'],
  ['go', 'go'],
  ['java', 'java'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['json', 'json'],
  ['kt', 'kotlin'],
  ['kts', 'kotlin'],
  ['md', 'markdown'],
  ['php', 'php'],
  ['py', 'python'],
  ['rb', 'ruby'],
  ['rs', 'rust'],
  ['scala', 'scala'],
  ['sql', 'sql'],
  ['swift', 'swift'],
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['yml', 'yaml'],
  ['yaml', 'yaml'],
  ['html', 'html'],
  ['css', 'css'],
]);

function findMatchingCodeBlock(
  code: string,
  languageHint: string | undefined,
  blocks: CodeBlock[]
): { languageHint?: string; filename?: string; startLine?: number } {
  if (blocks.length === 0) {
    return { languageHint };
  }

  const normalizedCode = code.trim();
  const index = blocks.findIndex(
    (block) => block.code.trim() === normalizedCode
  );

  if (index === -1) {
    return { languageHint };
  }

  const [matched] = blocks.splice(index, 1);
  const languageFromBlock = matched.language.trim();
  const resolvedLanguageHint =
    languageFromBlock.length > 0 ? languageFromBlock : languageHint;

  return {
    languageHint: resolvedLanguageHint,
    filename: matched.filename,
    startLine: matched.startLine,
  };
}

function parseMessageContent(
  content: string,
  codeBlocks?: CodeBlock[]
): MessageSegment[] {
  const lines = content.split('\n');
  const segments: MessageSegment[] = [];
  const remainingBlocks = codeBlocks ? [...codeBlocks] : [];

  let textBuffer: string[] = [];
  let codeBuffer: string[] | null = null;
  let codeLanguageHint: string | undefined;

  const flushText = (): void => {
    if (textBuffer.length === 0) {
      return;
    }

    const text = textBuffer.join('\n');
    segments.push({
      type: 'text',
      id: `text-${segments.length}`,
      text,
    });
    textBuffer = [];
  };

  const flushCode = (): void => {
    if (codeBuffer === null) {
      return;
    }

    const code = codeBuffer.join('\n');
    const match = findMatchingCodeBlock(
      code,
      codeLanguageHint,
      remainingBlocks
    );

    segments.push({
      type: 'code',
      id: `code-${segments.length}`,
      code,
      languageHint: match.languageHint,
      filename: match.filename,
      startLine: match.startLine,
    });

    codeBuffer = null;
    codeLanguageHint = undefined;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (codeBuffer === null) {
        flushText();
        codeBuffer = [];
        const token = line.slice(3).trim();
        codeLanguageHint = token.length > 0 ? token : undefined;
      } else {
        flushCode();
      }
      continue;
    }

    if (codeBuffer !== null) {
      codeBuffer.push(line);
      continue;
    }

    textBuffer.push(line);
  }

  if (codeBuffer !== null) {
    textBuffer.push(`\`\`\`${codeLanguageHint ?? ''}`);
    textBuffer.push(...codeBuffer);
  }

  flushText();

  if (segments.length === 0) {
    return [
      {
        type: 'text',
        id: 'text-0',
        text: content,
      },
    ];
  }

  return segments;
}

function resolveLanguage(languageHint?: string, filename?: string): string {
  if (typeof languageHint === 'string') {
    const normalizedHint = languageHint.trim().toLowerCase();
    if (normalizedHint.length > 0 && KNOWN_LANGUAGES.has(normalizedHint)) {
      return normalizedHint;
    }
  }

  if (typeof filename === 'string') {
    const normalizedFilename = filename.trim().toLowerCase();
    if (normalizedFilename.length > 0) {
      const extension = normalizedFilename.split('.').pop();
      if (typeof extension === 'string' && extension.length > 0) {
        const mapped = EXTENSION_LANGUAGE_MAP.get(extension);
        if (typeof mapped === 'string' && KNOWN_LANGUAGES.has(mapped)) {
          return mapped;
        }
      }
    }
  }

  return 'text';
}

/**
 * Task 6.4: Highlight keywords in text
 * Requirement 8.4: Highlights all keyword occurrences in conversation
 */
function highlightKeywordsInText(
  text: string,
  keywords?: string[]
): React.ReactNode {
  if (!keywords || keywords.length === 0 || text.length === 0) {
    return text;
  }

  // Create a regex pattern that matches any of the keywords (case-insensitive)
  // Note: Keywords are escaped to prevent regex injection
  const pattern = keywords
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special regex chars
    .join('|');

  // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern is sanitized above
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    // Check if this part matches any keyword (case-insensitive)
    const isKeyword = keywords.some(
      (keyword) => part.toLowerCase() === keyword.toLowerCase()
    );

    if (isKeyword) {
      return (
        <mark key={`highlight-${index}`} className="bg-yellow-200 dark:bg-yellow-800 text-gray-900 dark:text-gray-100 rounded px-0.5">
          {part}
        </mark>
      );
    }

    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}

function renderTextContent(
  text: string,
  highlightKeywords?: string[]
): React.ReactNode {
  if (text.length === 0) {
    return null;
  }

  const lines = text.split('\n');

  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {highlightKeywordsInText(line, highlightKeywords)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

const CodeBlockView = memo<CodeBlockViewProps>(
  ({
    blockId,
    code,
    languageHint,
    filename,
    startLine,
    theme,
    onCopy,
    isCopied,
  }) => {
    const { t } = useI18n();
    const codeRef = useRef<HTMLElement>(null);
    const resolvedLanguage = useMemo(
      () => resolveLanguage(languageHint, filename),
      [languageHint, filename]
    );

    useEffect(() => {
      const highlightCode = async (): Promise<void> => {
        if (codeRef.current && resolvedLanguage) {
          await loadPrismLanguage(resolvedLanguage);
          Prism.highlightElement(codeRef.current);
        }
      };

      highlightCode().catch((error) => {
        frontendLogger.warn('Failed to highlight code', {
          metadata: {
            language: resolvedLanguage,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });
    }, [code, resolvedLanguage, theme]);

    const handleCopyClick = useCallback((): void => {
      onCopy(code, blockId);
    }, [code, blockId, onCopy]);

    const totalLines = useMemo(() => code.split('\n').length, [code]);
    const safeFilename = typeof filename === 'string' ? filename.trim() : '';

    return (
      <div className="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-700 dark:text-gray-300 uppercase">
              {t('chat.codeLanguage', { language: resolvedLanguage })}
            </span>
            {safeFilename.length > 0 ? (
              <span className="text-xs text-gray-700 dark:text-gray-300" title={safeFilename}>
                {t('chat.codeFile', { filename: safeFilename })}
              </span>
            ) : null}
            {typeof startLine === 'number' ? (
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {t('chat.codeLines', {
                  start: startLine,
                  end: startLine + totalLines - 1,
                })}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              "text-xs px-2 py-1 rounded transition-colors",
              isCopied 
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" 
                : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            )}
            onClick={handleCopyClick}
            aria-label={isCopied ? t('chat.copied') : t('chat.copyCode')}
          >
            {isCopied ? t('chat.copied') : t('chat.copy')}
          </button>
        </div>
        <div className="p-4 overflow-x-auto">
          <pre className={`text-sm font-mono leading-relaxed language-${resolvedLanguage}`}>
            <code ref={codeRef} className={`language-${resolvedLanguage}`}>
              {code}
            </code>
          </pre>
        </div>
      </div>
    );
  }
);

CodeBlockView.displayName = 'CodeBlockView';

const MessageItemComponent = ({
  message,
  isStreaming = false,
  onCopyCode,
  onRetryMessage,
  highlightKeywords,
}: MessageItemProps): JSX.Element => {
  const { t, formatRelativeTime, formatDateTime, formatFileSize } = useI18n();
  const { resolvedTheme } = useTheme();
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const segments = useMemo(
    () => parseMessageContent(message.content, message.codeBlocks),
    [message.content, message.codeBlocks]
  );

  const performCopy = useCallback(
    async (code: string, codeId: string) => {
      try {
        if (!('clipboard' in navigator)) {
          throw new Error('Clipboard API is not available');
        }

        const clipboard = navigator.clipboard;
        await clipboard.writeText(code);
        setCopiedCodeId(codeId);
        onCopyCode?.(code);

        window.setTimeout(() => {
          setCopiedCodeId((current) => (current === codeId ? null : current));
        }, 2000);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        frontendLogger.error('Failed to copy code block', {
          metadata: {
            messageId: message.id,
            codeId,
          },
          error: normalizedError,
        });
      }
    },
    [message.id, onCopyCode]
  );

  const handleCopyRequest = useCallback(
    (code: string, codeId: string): void => {
      performCopy(code, codeId).catch(() => undefined);
    },
    [performCopy]
  );

  const handleRetryClick = useCallback((): void => {
    if (typeof onRetryMessage === 'function') {
      onRetryMessage(message.id);
    }
  }, [message.id, onRetryMessage]);

  const showRetryButton =
    !isStreaming &&
    message.role === 'user' &&
    message.retryable === true &&
    typeof onRetryMessage === 'function';

  const hasAttachments =
    Array.isArray(message.files) && message.files.length > 0;
  const hasContextTokens =
    typeof message.contextTokens === 'number' &&
    Number.isFinite(message.contextTokens) &&
    message.contextTokens > 0;

  const timestampLabel = useMemo(
    () => formatRelativeTime(message.timestamp),
    [formatRelativeTime, message.timestamp]
  );
  const timestampTitle = useMemo(
    () => formatDateTime(message.timestamp),
    [formatDateTime, message.timestamp]
  );

  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        "flex gap-4 w-full max-w-4xl mx-auto p-4 rounded-2xl transition-all duration-200",
        isUser ? "flex-row-reverse bg-blue-50/50 dark:bg-blue-900/10" : "bg-white/50 dark:bg-gray-800/50",
        isStreaming && "animate-pulse"
      )}
      data-message-id={message.id}
    >
      <div className="flex-shrink-0">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-sm",
          isUser ? "bg-blue-100 dark:bg-blue-900" : "bg-green-100 dark:bg-green-900"
        )}>
          {isUser ? '👤' : '🤖'}
        </div>
      </div>

      <div className={cn(
        "flex-1 min-w-0 flex flex-col gap-2",
        isUser && "items-end"
      )}>
        <div className={cn(
          "flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300",
          isUser && "flex-row-reverse"
        )}>
          <span className="font-medium">
            {isUser ? t('chat.you') : t('chat.assistant')}
          </span>
          {typeof message.model === 'string' &&
          message.model.trim().length > 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {message.model}
            </span>
          ) : null}
          <time
            dateTime={message.timestamp.toISOString()}
            title={timestampTitle}
          >
            {timestampLabel}
          </time>
        </div>

        <div className={cn(
          "prose dark:prose-invert max-w-none break-words",
          isUser ? "text-right" : "text-left"
        )}>
          {hasAttachments ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.files?.map((file) => (
                <div key={file.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">
                  <span className="text-lg" aria-hidden="true">
                    📎
                  </span>
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {segments.map((segment) => {
            if (segment.type === 'text') {
              const rendered = renderTextContent(
                segment.text,
                highlightKeywords
              );
              if (rendered === null) {
                return null;
              }

              return (
                <div key={segment.id} className="whitespace-pre-wrap">
                  {rendered}
                </div>
              );
            }

            return (
              <CodeBlockView
                key={segment.id}
                blockId={segment.id}
                code={segment.code}
                languageHint={segment.languageHint}
                filename={segment.filename}
                startLine={segment.startLine}
                theme={resolvedTheme}
                onCopy={handleCopyRequest}
                isCopied={copiedCodeId === segment.id}
              />
            );
          })}

          {isStreaming ? (
            <div className="inline-block ml-1 animate-pulse" aria-live="polite">
              <span className="text-blue-700 dark:text-blue-200" aria-label="Streaming">
                ▋
              </span>
            </div>
          ) : null}
        </div>

        {hasContextTokens || showRetryButton ? (
          <div className={cn(
            "flex items-center gap-3 mt-1 text-xs text-gray-700 dark:text-gray-300",
            isUser && "flex-row-reverse"
          )}>
            {hasContextTokens ? (
              <span className="font-mono">
                {t('chat.contextTokens', { count: message.contextTokens })}
              </span>
            ) : null}
            {showRetryButton ? (
              <button
                type="button"
                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                onClick={handleRetryClick}
                aria-label={t('chat.retry')}
              >
                {t('chat.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

MessageItemComponent.displayName = 'MessageItem';

export const MessageItem = memo(MessageItemComponent);
