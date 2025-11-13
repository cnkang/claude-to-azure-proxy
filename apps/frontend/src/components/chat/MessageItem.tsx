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
import './MessageItem.css';

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
      metadata: { language, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

interface MessageItemProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
  readonly onCopyCode?: (code: string) => void;
  readonly onRetryMessage?: (messageId: string) => void;
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

function renderTextContent(text: string): React.ReactNode {
  if (text.length === 0) {
    return null;
  }

  const lines = text.split('\n');

  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {line}
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
          metadata: { language: resolvedLanguage, error: error instanceof Error ? error.message : String(error) },
        });
      });
    }, [code, resolvedLanguage, theme]);

    const handleCopyClick = useCallback((): void => {
      onCopy(code, blockId);
    }, [code, blockId, onCopy]);

    const totalLines = useMemo(() => code.split('\n').length, [code]);
    const safeFilename = typeof filename === 'string' ? filename.trim() : '';

    return (
      <div className={`code-block theme-${theme}`}>
        <div className="code-header">
          <span className="code-language">
            {t('chat.codeLanguage', { language: resolvedLanguage })}
          </span>
          {safeFilename.length > 0 ? (
            <span className="code-filename" title={safeFilename}>
              {t('chat.codeFile', { filename: safeFilename })}
            </span>
          ) : null}
          {typeof startLine === 'number' ? (
            <span className="code-line-info">
              {t('chat.codeLines', {
                start: startLine,
                end: startLine + totalLines - 1,
              })}
            </span>
          ) : null}
          <button
            type="button"
            className={`copy-button ${isCopied ? 'copied' : ''}`}
            onClick={handleCopyClick}
            aria-label={isCopied ? t('chat.copied') : t('chat.copyCode')}
          >
            {isCopied ? t('chat.copied') : t('chat.copy')}
          </button>
        </div>
        <div className="code-body">
          <pre className={`code-content language-${resolvedLanguage}`}>
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

  return (
    <div
      className={`message-item ${message.role} ${isStreaming ? 'streaming' : ''}`}
      data-message-id={message.id}
    >
      <div className="message-avatar">
        <div className={`avatar ${message.role}`}>
          {message.role === 'user' ? '👤' : '🤖'}
        </div>
      </div>

      <div className="message-body">
        <div className="message-header">
          <span className="message-role">
            {message.role === 'user' ? t('chat.you') : t('chat.assistant')}
          </span>
          {typeof message.model === 'string' &&
          message.model.trim().length > 0 ? (
            <span className="message-model">{message.model}</span>
          ) : null}
          <time
            className="message-timestamp"
            dateTime={message.timestamp.toISOString()}
            title={timestampTitle}
          >
            {timestampLabel}
          </time>
        </div>

        <div className="message-content">
          {hasAttachments ? (
            <div className="message-files">
              {message.files?.map((file) => (
                <div key={file.id} className="file-attachment">
                  <span className="file-icon" aria-hidden="true">
                    📎
                  </span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {segments.map((segment) => {
            if (segment.type === 'text') {
              const rendered = renderTextContent(segment.text);
              if (rendered === null) {
                return null;
              }

              return (
                <div key={segment.id} className="message-text">
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
            <div className="streaming-indicator" aria-live="polite">
              <span className="streaming-cursor" aria-label="Streaming">▋</span>
            </div>
          ) : null}
        </div>

        {hasContextTokens || showRetryButton ? (
          <div className="message-footer">
            {hasContextTokens ? (
              <span className="context-tokens">
                {t('chat.contextTokens', { count: message.contextTokens })}
              </span>
            ) : null}
            {showRetryButton ? (
              <button
                type="button"
                className="retry-button"
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
