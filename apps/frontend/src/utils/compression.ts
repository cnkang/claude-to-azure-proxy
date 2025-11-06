/**
 * Data Compression Utilities
 *
 * Provides efficient data compression and decompression utilities for storage optimization.
 * Uses modern Compression Streams API when available, with fallback implementations.
 *
 * Requirements: 14.3, 14.5
 */

// Compression configuration
const COMPRESSION_THRESHOLD = 1024; // Compress data larger than 1KB
// const _COMPRESSION_LEVEL = 6; // Balanced compression level

/**
 * Compression result interface
 */
export interface CompressionResult {
  data: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  method: 'gzip' | 'simple' | 'none';
  compressed: boolean;
}

/**
 * Compression statistics
 */
export interface CompressionStats {
  totalOriginalSize: number;
  totalCompressedSize: number;
  averageCompressionRatio: number;
  compressionCount: number;
  method: string;
}

/**
 * Advanced compression utilities
 */
export class CompressionUtils {
  private static stats: CompressionStats = {
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    averageCompressionRatio: 0,
    compressionCount: 0,
    method: 'unknown',
  };

  /**
   * Compress data using the best available method
   */
  public static async compress(data: string): Promise<CompressionResult> {
    const originalSize = new Blob([data]).size;

    // Skip compression for small data
    if (originalSize < COMPRESSION_THRESHOLD) {
      return {
        data,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0,
        method: 'none',
        compressed: false,
      };
    }

    try {
      // Try modern Compression Streams first
      if (this.isCompressionStreamAvailable()) {
        return await this.compressWithStreams(data, originalSize);
      } else {
        // Fallback to simple compression
        return this.compressSimple(data, originalSize);
      }
    } catch {
      // Compression failed, using uncompressed data
      // Note: In production, this should use proper logging
      return {
        data,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0,
        method: 'none',
        compressed: false,
      };
    }
  }

  /**
   * Decompress data
   */
  public static async decompress(result: CompressionResult): Promise<string> {
    if (!result.compressed) {
      return result.data;
    }

    try {
      switch (result.method) {
        case 'gzip':
          return await this.decompressWithStreams(result.data);
        case 'simple':
          return this.decompressSimple(result.data);
        default:
          return result.data;
      }
    } catch {
      // Decompression failed, treating as uncompressed
      // Note: In production, this should use proper logging
      return result.data;
    }
  }

  /**
   * Compress using Compression Streams (modern browsers)
   */
  private static async compressWithStreams(
    data: string,
    originalSize: number
  ): Promise<CompressionResult> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];

    // Start compression
    const writePromise = writer
      .write(encoder.encode(data))
      .then(() => writer.close());

    // Read compressed chunks
    const readPromise = (async (): Promise<void> => {
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
    })();

    await Promise.all([writePromise, readPromise]);

    // Combine chunks and encode as base64
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const compressedData = btoa(String.fromCharCode(...combined));
    const compressedSize = compressedData.length;
    const compressionRatio = this.calculateCompressionRatio(
      originalSize,
      compressedSize
    );

    // Update statistics
    this.updateStats(originalSize, compressedSize, 'gzip');

    return {
      data: compressedData,
      originalSize,
      compressedSize,
      compressionRatio,
      method: 'gzip',
      compressed: true,
    };
  }

  /**
   * Decompress using Decompression Streams
   */
  private static async decompressWithStreams(
    compressedData: string
  ): Promise<string> {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Convert base64 to Uint8Array
    const binaryString = atob(compressedData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const chunks: Uint8Array[] = [];

    // Start decompression
    const writePromise = writer.write(bytes).then(() => writer.close());

    // Read decompressed chunks
    const readPromise = (async (): Promise<void> => {
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
    })();

    await Promise.all([writePromise, readPromise]);

    // Combine chunks and decode
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder();
    return decoder.decode(combined);
  }

  /**
   * Simple compression fallback for older browsers
   */
  private static compressSimple(
    data: string,
    originalSize: number
  ): CompressionResult {
    // Dictionary-based compression for JSON data
    const compressed = this.compressWithDictionary(data);
    const compressedSize = compressed.length;
    const compressionRatio = this.calculateCompressionRatio(
      originalSize,
      compressedSize
    );

    // Update statistics
    this.updateStats(originalSize, compressedSize, 'simple');

    return {
      data: compressed,
      originalSize,
      compressedSize,
      compressionRatio,
      method: 'simple',
      compressed: true,
    };
  }

  /**
   * Simple decompression fallback
   */
  private static decompressSimple(compressedData: string): string {
    return this.decompressWithDictionary(compressedData);
  }

  /**
   * Dictionary-based compression for JSON data
   */
  private static compressWithDictionary(data: string): string {
    // Common JSON patterns in conversation data
    const dictionary = [
      '"id":',
      '"role":',
      '"content":',
      '"timestamp":',
      '"conversationId":',
      '"sessionId":',
      '"createdAt":',
      '"updatedAt":',
      '"messages":',
      '"title":',
      '"selectedModel":',
      '"isStreaming":',
      '"modelHistory":',
      '"contextUsage":',
      '"currentTokens":',
      '"maxTokens":',
      '"canExtend":',
      '"user"',
      '"assistant"',
      '"correlationId":',
      '"isComplete":',
      '"files":',
      '"codeBlocks":',
      '"language":',
      '"code":',
      'true',
      'false',
      'null',
    ];

    let compressed = data;
    const replacements: Array<[string, string]> = [];

    // Replace common patterns with shorter tokens
    dictionary.forEach((pattern, index) => {
      const token = `~${index.toString(36)}~`;
      if (compressed.includes(pattern)) {
        replacements.push([token, pattern]);
        compressed = compressed.split(pattern).join(token);
      }
    });

    // Store replacement map at the beginning
    const header = JSON.stringify(replacements);
    return `${header.length.toString(36)}:${header}${compressed}`;
  }

  /**
   * Dictionary-based decompression
   */
  private static decompressWithDictionary(compressedData: string): string {
    try {
      // Extract header length
      const colonIndex = compressedData.indexOf(':');
      if (colonIndex === -1) {
        return compressedData; // Not compressed with dictionary
      }

      const headerLength = parseInt(
        compressedData.substring(0, colonIndex),
        36
      );
      const header = compressedData.substring(
        colonIndex + 1,
        colonIndex + 1 + headerLength
      );
      const compressed = compressedData.substring(
        colonIndex + 1 + headerLength
      );

      // Parse replacement map
      const parsedHeader: unknown = JSON.parse(header);
      if (!Array.isArray(parsedHeader)) {
        throw new Error('Invalid compression header format');
      }
      const replacements: Array<[string, string]> = parsedHeader as Array<
        [string, string]
      >;

      // Restore original patterns
      let decompressed = compressed;
      replacements.forEach(([token, pattern]) => {
        decompressed = decompressed.split(token).join(pattern);
      });

      return decompressed;
    } catch {
      // Dictionary decompression failed
      // Note: In production, this should use proper logging
      return compressedData;
    }
  }

  /**
   * Check if Compression Streams are available
   */
  private static isCompressionStreamAvailable(): boolean {
    return 'CompressionStream' in window && 'DecompressionStream' in window;
  }

  /**
   * Calculate compression ratio as percentage
   */
  private static calculateCompressionRatio(
    originalSize: number,
    compressedSize: number
  ): number {
    if (originalSize === 0) {
      return 0;
    }
    return ((originalSize - compressedSize) / originalSize) * 100;
  }

  /**
   * Update compression statistics
   */
  private static updateStats(
    originalSize: number,
    compressedSize: number,
    method: string
  ): void {
    this.stats.totalOriginalSize += originalSize;
    this.stats.totalCompressedSize += compressedSize;
    this.stats.compressionCount++;
    this.stats.method = method;

    if (this.stats.totalOriginalSize > 0) {
      this.stats.averageCompressionRatio =
        ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) /
          this.stats.totalOriginalSize) *
        100;
    }
  }

  /**
   * Get compression statistics
   */
  public static getStats(): CompressionStats {
    return { ...this.stats };
  }

  /**
   * Reset compression statistics
   */
  public static resetStats(): void {
    this.stats = {
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      averageCompressionRatio: 0,
      compressionCount: 0,
      method: 'unknown',
    };
  }

  /**
   * Batch compress multiple items
   */
  public static async compressBatch(
    items: string[]
  ): Promise<CompressionResult[]> {
    const results: CompressionResult[] = [];

    for (const item of items) {
      try {
        const result = await this.compress(item);
        results.push(result);
      } catch {
        // Batch compression failed for item
        // Note: In production, this should use proper logging
        // Add uncompressed result for failed items
        const originalSize = new Blob([item]).size;
        results.push({
          data: item,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 0,
          method: 'none',
          compressed: false,
        });
      }
    }

    return results;
  }

  /**
   * Batch decompress multiple items
   */
  public static async decompressBatch(
    results: CompressionResult[]
  ): Promise<string[]> {
    const items: string[] = [];

    for (const result of results) {
      try {
        const item = await this.decompress(result);
        items.push(item);
      } catch {
        // Batch decompression failed for result
        // Note: In production, this should use proper logging
        // Use original data for failed items
        items.push(result.data);
      }
    }

    return items;
  }

  /**
   * Estimate compression benefit for data
   */
  public static estimateCompressionBenefit(data: string): {
    worthCompressing: boolean;
    estimatedRatio: number;
    estimatedSavings: number;
  } {
    const size = new Blob([data]).size;

    if (size < COMPRESSION_THRESHOLD) {
      return {
        worthCompressing: false,
        estimatedRatio: 0,
        estimatedSavings: 0,
      };
    }

    // Estimate compression ratio based on data characteristics
    let estimatedRatio = 0;

    // JSON data typically compresses well
    if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
      estimatedRatio = 60; // 60% compression ratio for JSON
    }
    // Text data with repetition
    else if (this.hasRepetitivePatterns(data)) {
      estimatedRatio = 40; // 40% compression ratio for repetitive text
    }
    // General text
    else {
      estimatedRatio = 30; // 30% compression ratio for general text
    }

    const estimatedSavings = (size * estimatedRatio) / 100;

    return {
      worthCompressing: estimatedSavings > 100, // Worth compressing if saves >100 bytes
      estimatedRatio,
      estimatedSavings,
    };
  }

  /**
   * Check if data has repetitive patterns
   */
  private static hasRepetitivePatterns(data: string): boolean {
    // Simple heuristic: check for repeated substrings
    const sample = data.substring(0, Math.min(1000, data.length));
    const patterns = new Set<string>();

    for (let i = 0; i < sample.length - 10; i++) {
      const pattern = sample.substring(i, i + 10);
      if (patterns.has(pattern)) {
        return true;
      }
      patterns.add(pattern);
    }

    return false;
  }
}

/**
 * Convenience functions for compression
 */
export const compressionUtils = {
  /**
   * Quick compress function
   */
  async compress(data: string): Promise<CompressionResult> {
    return CompressionUtils.compress(data);
  },

  /**
   * Quick decompress function
   */
  async decompress(result: CompressionResult): Promise<string> {
    return CompressionUtils.decompress(result);
  },

  /**
   * Check if compression is beneficial
   */
  shouldCompress(data: string): boolean {
    const estimate = CompressionUtils.estimateCompressionBenefit(data);
    return estimate.worthCompressing;
  },

  /**
   * Get compression statistics
   */
  getStats(): CompressionStats {
    return CompressionUtils.getStats();
  },

  /**
   * Format compression ratio for display
   */
  formatCompressionRatio(ratio: number): string {
    return `${ratio.toFixed(1)}%`;
  },

  /**
   * Format file size for display
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const rawIndex = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.min(units.length - 1, Math.max(0, rawIndex));

    const sizeUnit = units.at(index) ?? 'Bytes';
    return `${(bytes / Math.pow(k, index)).toFixed(2)} ${sizeUnit}`;
  },
};
