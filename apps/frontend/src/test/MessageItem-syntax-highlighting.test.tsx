import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MessageItem } from '../components/chat/MessageItem.js';
import type { Message } from '../types/index.js';

const { highlightSpy } = vi.hoisted(() => ({
  highlightSpy: vi.fn(),
}));

vi.mock('prismjs', () => ({
  default: {
    highlightElement: highlightSpy,
  },
}));

vi.mock('prismjs/themes/prism.css', () => ({}));
vi.mock('prismjs/themes/prism-dark.css', () => ({}));
vi.mock('prismjs/components/prism-javascript', () => ({}));
vi.mock('prismjs/components/prism-typescript', () => ({}));
vi.mock('prismjs/components/prism-python', () => ({}));
vi.mock('prismjs/components/prism-java', () => ({}));
vi.mock('prismjs/components/prism-cpp', () => ({}));
vi.mock('prismjs/components/prism-json', () => ({}));
vi.mock('prismjs/components/prism-markdown', () => ({}));
vi.mock('prismjs/components/prism-css', () => ({}));
vi.mock('prismjs/components/prism-html', () => ({}));
vi.mock('prismjs/components/prism-bash', () => ({}));
vi.mock('prismjs/components/prism-sql', () => ({}));

const translations: Record<string, string> = {
  'chat.codeLanguage': 'language: {{language}}',
  'chat.copyCode': 'Copy code',
  'chat.copy': 'Copy',
  'chat.copied': 'Copied!',
  'chat.codeFile': 'File: {{filename}}',
  'chat.codeLines': 'Lines {{start}}-{{end}}',
  'chat.you': 'You',
  'chat.assistant': 'Assistant',
  'chat.contextTokens': '{{count}} tokens',
  'chat.retry': 'Retry',
};

vi.mock('../contexts/I18nContext.js', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = translations[key] ?? key;
      if (options) {
        return template.replace(/{{(.*?)}}/g, (_, token: string) =>
          String(options[token.trim() as keyof typeof options] ?? '')
        );
      }
      return template;
    },
    formatRelativeTime: () => 'just now',
    formatDateTime: (date: Date) => date.toISOString(),
    formatFileSize: (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`,
  }),
}));

vi.mock('../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    resolvedTheme: 'light' as const,
  }),
}));

vi.mock('../utils/logger.js', () => ({
  frontendLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const createMessage = (overrides?: Partial<Message>): Message => ({
  id: 'msg-1',
  role: 'assistant',
  content:
    'Here is an example:\n\n```typescript\nconst answer = 42;\nconsole.log(answer);\n```',
  timestamp: new Date('2024-02-01T12:00:00.000Z'),
  correlationId: 'corr-id',
  conversationId: 'conv-1',
  isComplete: true,
  codeBlocks: [
    {
      id: 'code-1',
      language: 'typescript',
      code: 'const answer = 42;\nconsole.log(answer);',
      filename: 'index.ts',
      startLine: 10,
    },
  ],
  ...overrides,
});

describe('MessageItem syntax highlighting', () => {
  const clipboardWrite = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    highlightSpy.mockClear();
    clipboardWrite.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWrite,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders code blocks and handles copy interactions', async () => {
    // Use real timers for this test to avoid Promise resolution issues
    vi.useRealTimers();

    const onCopy = vi.fn();
    render(<MessageItem message={createMessage()} onCopyCode={onCopy} />);

    expect(screen.getByText('Assistant')).toBeDefined();
    expect(
      screen.getByText((text) => text.includes('const answer = 42;'))
    ).toBeDefined();
    expect(
      screen.getByText((text) => text.includes('console.log(answer);'))
    ).toBeDefined();

    const copyButton = screen.getByRole('button', { name: /copy code/i });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(clipboardWrite).toHaveBeenCalledWith(
      'const answer = 42;\nconsole.log(answer);'
    );

    expect(onCopy).toHaveBeenCalledWith(
      'const answer = 42;\nconsole.log(answer);'
    );

    expect(screen.getByRole('button', { name: /copied/i })).toBeDefined();

    // Restore fake timers for other tests
    vi.useFakeTimers();
  });

  it('shows attachments, retry action, and context token metadata', () => {
    const retrySpy = vi.fn();
    render(
      <MessageItem
        message={createMessage({
          id: 'msg-2',
          role: 'user',
          content: 'Uploading design document',
          files: [
            {
              id: 'file-1',
              name: 'design.pdf',
              size: 2048,
              type: 'application/pdf',
            },
          ],
          contextTokens: 256,
          retryable: true,
        })}
        onRetryMessage={retrySpy}
      />
    );

    expect(screen.getByText('design.pdf')).toBeDefined();
    expect(screen.getByText('(2.0 KB)')).toBeDefined();
    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    expect(retrySpy).toHaveBeenCalledWith('msg-2');
    expect(screen.getByText('256 tokens')).toBeDefined();
  });
});
