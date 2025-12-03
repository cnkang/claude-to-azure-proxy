/**
 * Helper functions for FilePreview component
 * Extracted to reduce cognitive complexity
 */

/**
 * Map of file extensions to syntax highlighting classes
 */
const SYNTAX_CLASS_MAP: Record<string, string> = {
  '.js': 'language-javascript',
  '.ts': 'language-typescript',
  '.py': 'language-python',
  '.java': 'language-java',
  '.cpp': 'language-cpp',
  '.c': 'language-c',
  '.h': 'language-c',
  '.css': 'language-css',
  '.html': 'language-html',
  '.json': 'language-json',
  '.xml': 'language-xml',
  '.md': 'language-markdown',
};

/**
 * Get syntax highlighting class for a file extension
 */
export const getSyntaxClassForExtension = (extension: string): string => {
  return SYNTAX_CLASS_MAP[extension] ?? 'language-text';
};

/**
 * Determine file type based on extension
 */
export const determineFileType = (
  extension: string,
  imageExtensions: Set<string>,
  codeExtensions: Set<string>,
  textExtensions: Set<string>
): 'image' | 'code' | 'text' | 'unknown' => {
  if (imageExtensions.has(extension)) {
    return 'image';
  }
  if (codeExtensions.has(extension)) {
    return 'code';
  }
  if (textExtensions.has(extension)) {
    return 'text';
  }
  return 'unknown';
};

/**
 * Extract file extension from filename
 */
export const extractFileExtension = (fileName: string): string => {
  const segments = fileName.split('.');
  return segments.length > 1 ? `.${segments.pop()?.toLowerCase() ?? ''}` : '';
};

/**
 * Read file as data URL (for images)
 */
export const readFileAsDataURL = (targetFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('Failed to read file'));
    };
    reader.readAsDataURL(targetFile);
  });
};

/**
 * Load file content based on type
 */
export const loadFileContentByType = async (
  file: File,
  extension: string,
  imageExtensions: Set<string>
): Promise<string> => {
  if (imageExtensions.has(extension)) {
    return await readFileAsDataURL(file);
  }
  return await file.text();
};

/**
 * File preview content components
 */
import type React from 'react';

export interface PreviewContentProps {
  content: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  formatFileSize: (size: number) => string;
  t: (key: string, params?: Record<string, unknown>) => string;
  getSyntaxClass?: () => string;
}

/**
 * Image preview component
 */
export const ImagePreview: React.FC<Pick<PreviewContentProps, 'content' | 'fileName'>> = ({
  content,
  fileName,
}) => (
  <div className="flex items-center justify-center h-full">
    <img
      src={content}
      alt={fileName}
      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
    />
  </div>
);

/**
 * Code/Text preview component
 */
export const CodePreview: React.FC<Pick<PreviewContentProps, 'content' | 'getSyntaxClass'>> = ({
  content,
  getSyntaxClass,
}) => {
  const syntaxClass = getSyntaxClass?.() ?? 'language-text';
  return (
    <div className="h-full">
      <pre
        className={`p-4 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-auto text-sm font-mono h-full ${syntaxClass}`}
      >
        <code>{content}</code>
      </pre>
    </div>
  );
};

/**
 * Unknown file type preview component
 */
export const UnknownFilePreview: React.FC<
  Pick<PreviewContentProps, 'fileName' | 'fileSize' | 'fileType' | 'formatFileSize' | 't'>
> = ({ fileName, fileSize, fileType, formatFileSize, t }) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-4">
    <div className="text-6xl opacity-50">📄</div>
    <p className="text-lg font-medium">{t('fileUpload.preview.unsupportedType')}</p>
    <p className="text-sm text-center max-w-md">
      {t('fileUpload.preview.fileInfo', {
        name: fileName,
        size: formatFileSize(fileSize),
        type: fileType || t('fileUpload.preview.unknownType'),
      })}
    </p>
  </div>
);
