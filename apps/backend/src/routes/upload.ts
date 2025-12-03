/**
 * File Upload Route Handler
 *
 * Handles secure file uploads with validation, security scanning,
 * and temporary storage for chat attachments.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';

// File upload configuration
const UPLOAD_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  allowedMimeTypes: [
    // Text files
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    'application/xml',
    'text/xml',

    // Code files
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'application/typescript',
    'text/x-python',
    'application/x-python-code',
    'text/x-java-source',
    'text/x-c++src',
    'text/x-csrc',
    'text/x-chdr',
    'text/css',
    'text/html',

    // Images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ],
  allowedExtensions: [
    '.txt',
    '.md',
    '.json',
    '.csv',
    '.xml',
    '.js',
    '.ts',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.css',
    '.html',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
  ],
  tempDir: path.join(os.tmpdir(), 'chat-uploads'),
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

// Ensure temp directory exists
async function ensureTempDir(): Promise<void> {
  try {
    await fs.access(UPLOAD_CONFIG.tempDir);
  } catch {
    await fs.mkdir(UPLOAD_CONFIG.tempDir, { recursive: true });
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_CONFIG.maxFileSize,
    files: UPLOAD_CONFIG.maxFiles,
  },
  fileFilter: (req, file, cb) => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;

    // Check MIME type
    if (!UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      logger.warn('File upload rejected: invalid MIME type', correlationId, {
        filename: file.originalname,
        mimetype: file.mimetype,
      });
      return cb(
        new ValidationError(
          'Invalid file type',
          correlationId,
          'file',
          file.mimetype
        )
      );
    }

    // Check file extension
    const extension = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_CONFIG.allowedExtensions.includes(extension)) {
      logger.warn('File upload rejected: invalid extension', correlationId, {
        filename: file.originalname,
        extension,
      });
      return cb(
        new ValidationError(
          'Invalid file extension',
          correlationId,
          'file',
          extension
        )
      );
    }

    // Check filename for security
    if (
      file.originalname.includes('..') ||
      /[<>:"|?*]/.test(file.originalname)
    ) {
      logger.warn('File upload rejected: suspicious filename', correlationId, {
        filename: file.originalname,
      });
      return cb(
        new ValidationError(
          'Invalid filename',
          correlationId,
          'file',
          file.originalname
        )
      );
    }

    cb(null, true);
  },
});

/**
 * Validate file content for security threats
 */
async function validateFileContent(
  buffer: Buffer,
  filename: string,
  correlationId: string
): Promise<void> {
  // Check for executable signatures
  const executableSignatures = [
    Buffer.from([0x4d, 0x5a]), // PE executable (MZ)
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF executable
    Buffer.from([0xfe, 0xed, 0xfa, 0xce]), // Mach-O executable (32-bit)
    Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O executable (64-bit)
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // Java class file
  ];

  for (const signature of executableSignatures) {
    if (buffer.subarray(0, signature.length).equals(signature)) {
      logger.warn(
        'File upload rejected: executable signature detected',
        correlationId,
        {
          filename,
          signature: signature.toString('hex'),
        }
      );
      throw new ValidationError(
        'Executable file detected',
        correlationId,
        'file',
        filename
      );
    }
  }

  // Check for suspicious patterns in text files
  const textExtensions = [
    '.txt',
    '.md',
    '.js',
    '.ts',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.css',
    '.html',
    '.json',
    '.xml',
    '.csv',
  ];
  const extension = path.extname(filename).toLowerCase();

  if (textExtensions.includes(extension)) {
    try {
      const content = buffer.toString('utf8');

      // Check for script injection patterns
      const suspiciousPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
        /eval\s*\(/gi,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          logger.warn(
            'File upload rejected: suspicious content pattern',
            correlationId,
            {
              filename,
              pattern: pattern.source,
            }
          );
          throw new ValidationError(
            'Suspicious content detected',
            correlationId,
            'file',
            filename
          );
        }
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      // If text decoding fails, it might be binary content in a text file
      logger.warn(
        'File upload rejected: binary content in text file',
        correlationId,
        {
          filename,
        }
      );
      throw new ValidationError(
        'Invalid text file content',
        correlationId,
        'file',
        filename
      );
    }
  }
}

/**
 * Save uploaded file to temporary storage
 */
async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  correlationId: string
): Promise<{ fileId: string; filePath: string }> {
  await ensureTempDir();

  const fileId = uuidv4();
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${fileId}_${sanitizedName}`;
  const filePath = path.join(UPLOAD_CONFIG.tempDir, fileName);

  await fs.writeFile(filePath, buffer);

  logger.info('File uploaded successfully', correlationId, {
    fileId,
    originalName,
    size: buffer.length,
  });

  return { fileId, filePath };
}

/**
 * Clean up old uploaded files
 */
async function cleanupOldFiles(): Promise<void> {
  try {
    const files = await fs.readdir(UPLOAD_CONFIG.tempDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(UPLOAD_CONFIG.tempDir, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtime.getTime() > UPLOAD_CONFIG.maxAge) {
        await fs.unlink(filePath);
        logger.info('Cleaned up old uploaded file', '', { file });
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup old files', '', { error });
  }
}

// Start cleanup interval
setInterval(cleanupOldFiles, UPLOAD_CONFIG.cleanupInterval);

/**
 * File upload endpoint handler
 */
export const uploadFileHandler: RequestHandler[] = [
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;

    try {
      if (!req.file) {
        throw new ValidationError(
          'No file provided',
          correlationId,
          'file',
          'missing'
        );
      }

      const { buffer, originalname, mimetype, size } = req.file;

      logger.info('Processing file upload', correlationId, {
        filename: originalname,
        mimetype,
        size,
      });

      // Validate file content for security
      await validateFileContent(buffer, originalname, correlationId);

      // Save file to temporary storage
      const { fileId } = await saveUploadedFile(
        buffer,
        originalname,
        correlationId
      );

      // Return file information
      res.json({
        id: fileId,
        name: originalname,
        type: mimetype,
        size,
        url: `/api/files/${fileId}`, // URL for accessing the file
        correlationId,
      });
    } catch (error) {
      logger.error('File upload failed', correlationId, {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          error: {
            type: 'validation_error',
            message: error.message,
            correlationId,
          },
        });
      } else {
        res.status(500).json({
          error: {
            type: 'upload_error',
            message: 'File upload failed',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * File access endpoint handler
 */
export const getFileHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;
  const { fileId } = req.params;

  try {
    if (!fileId || !/^[a-f0-9-]{36}$/.test(fileId)) {
      throw new ValidationError(
        'Invalid file ID',
        correlationId,
        'fileId',
        fileId
      );
    }

    // Find file in temp directory
    const files = await fs.readdir(UPLOAD_CONFIG.tempDir);
    const targetFile = files.find((file) => file.startsWith(fileId));

    if (!targetFile) {
      res.status(404).json({
        error: {
          type: 'not_found',
          message: 'File not found',
          correlationId,
        },
      });
      return;
    }

    const filePath = path.join(UPLOAD_CONFIG.tempDir, targetFile);
    const stats = await fs.stat(filePath);

    // Check if file is too old
    if (Date.now() - stats.mtime.getTime() > UPLOAD_CONFIG.maxAge) {
      await fs.unlink(filePath);
      res.status(404).json({
        error: {
          type: 'expired',
          message: 'File has expired',
          correlationId,
        },
      });
      return;
    }

    // Determine content type from file extension
    const extension = path.extname(targetFile).toLowerCase();
    const mimeTypeMap: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.h': 'text/x-chdr',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypeMap[extension] || 'application/octet-stream';

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream file content
    const fileBuffer = await fs.readFile(filePath);
    res.send(fileBuffer);
  } catch (error) {
    logger.error('File access failed', correlationId, {
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          type: 'validation_error',
          message: error.message,
          correlationId,
        },
      });
    } else {
      res.status(500).json({
        error: {
          type: 'file_access_error',
          message: 'Failed to access file',
          correlationId,
        },
      });
    }
  }
};

/**
 * File deletion endpoint handler
 */
export const deleteFileHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;
  const { fileId } = req.params;

  try {
    if (!fileId || !/^[a-f0-9-]{36}$/.test(fileId)) {
      throw new ValidationError(
        'Invalid file ID',
        correlationId,
        'fileId',
        fileId
      );
    }

    // Find and delete file
    const files = await fs.readdir(UPLOAD_CONFIG.tempDir);
    const targetFile = files.find((file) => file.startsWith(fileId));

    if (targetFile) {
      const filePath = path.join(UPLOAD_CONFIG.tempDir, targetFile);
      await fs.unlink(filePath);

      logger.info('File deleted successfully', correlationId, {
        fileId,
      });
    }

    res.json({
      success: true,
      correlationId,
    });
  } catch (error) {
    logger.error('File deletion failed', correlationId, {
      fileId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'deletion_error',
        message: 'Failed to delete file',
        correlationId,
      },
    });
  }
};
