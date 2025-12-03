/**
 * Node.js 24 Performance Benchmarks
 * Comprehensive benchmarks comparing Node.js 22 vs 24 performance
 * Measures startup time improvements and memory usage efficiency
 */

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { bench, describe } from 'vitest';

// Node.js version detection for comparison benchmarks
const NODE_VERSION = process.version;
const IS_NODE_24 = NODE_VERSION.startsWith('v24.');

/**
 * Startup time measurement utility
 */
async function measureStartupTime(): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const child = spawn(process.execPath, ['-e', 'console.log("ready")'], {
      stdio: 'pipe',
    });

    child.stdout.on('data', () => {
      const endTime = performance.now();
      child.kill();
      resolve(endTime - startTime);
    });

    child.on('error', reject);

    setTimeout(() => {
      child.kill();
      reject(new Error('Startup timeout'));
    }, 5000);
  });
}

/**
 * Memory efficiency test with garbage collection monitoring
 */
async function testMemoryEfficiency(): Promise<{
  peakMemory: number;
  finalMemory: number;
  gcEvents: number;
}> {
  const gcMonitor = new GCMonitor();
  gcMonitor.start();

  const initialMemory = takeMemorySnapshot();
  let peakMemory = initialMemory.heapUsed;

  // Create memory pressure
  const arrays: number[][] = [];
  for (let i = 0; i < 1000; i++) {
    arrays.push(new Array(1000).fill(i));
    const currentMemory = takeMemorySnapshot();
    peakMemory = Math.max(peakMemory, currentMemory.heapUsed);
  }

  // Clear arrays and force GC
  arrays.length = 0;
  if (global.gc) {
    global.gc();
  }

  // Wait for cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));

  const finalMemory = takeMemorySnapshot();
  const gcEvents = gcMonitor.stop();

  return {
    peakMemory: peakMemory - initialMemory.heapUsed,
    finalMemory: finalMemory.heapUsed - initialMemory.heapUsed,
    gcEvents: gcEvents.length,
  };
}

describe('Node.js 24 Performance Benchmarks', () => {
  describe('Startup Performance', () => {
    bench(
      'Node.js startup time',
      async () => {
        await measureStartupTime();
      },
      {
        iterations: IS_NODE_24 ? 10 : 5, // More iterations for Node.js 24
        warmupIterations: 2,
      }
    );

    bench('Module loading performance', async () => {
      const startTime = performance.now();

      // Simulate loading multiple modules
      await Promise.all([
        import('node:fs/promises'),
        import('node:path'),
        import('node:crypto'),
        import('node:util'),
        import('node:stream'),
      ]);

      return performance.now() - startTime;
    });

    bench('TypeScript compilation simulation', () => {
      // Simulate TypeScript-like operations that benefit from V8 improvements
      const sourceCode = `
        interface User {
          id: number;
          name: string;
          email: string;
        }
        
        function processUser(user: User): string {
          return \`\${user.name} <\${user.email}>\`;
        }
      `;

      // Parse and process (simplified)
      const lines = sourceCode.split('\n');
      return lines
        .filter((line) => line.trim())
        .map((line) => line.trim())
        .join(' ');
    });
  });

  describe('Memory Efficiency Benchmarks', () => {
    bench(
      'Memory allocation and cleanup',
      async () => {
        const result = await testMemoryEfficiency();
        return result;
      },
      {
        iterations: 5,
        warmupIterations: 1,
      }
    );

    bench('Large object creation and GC', () => {
      const objects = [];

      // Create large objects
      for (let i = 0; i < 100; i++) {
        objects.push({
          id: i,
          data: new Array(1000).fill(i),
          metadata: {
            created: new Date(),
            tags: Array.from({ length: 50 }, (_, j) => `tag-${j}`),
            nested: {
              level1: { level2: { level3: `deep-${i}` } },
            },
          },
        });
      }

      // Process objects
      const result = objects.reduce((sum, obj) => sum + obj.data.length, 0);

      // Clear for GC
      objects.length = 0;

      return result;
    });

    bench('WeakMap vs Map memory efficiency', () => {
      const weakMap = new WeakMap();
      const regularMap = new Map();
      const objects = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      // WeakMap operations
      const weakMapStart = performance.now();
      objects.forEach((obj, i) => weakMap.set(obj, `weak-${i}`));
      const weakMapTime = performance.now() - weakMapStart;

      // Regular Map operations
      const mapStart = performance.now();
      objects.forEach((obj, i) => regularMap.set(obj, `regular-${i}`));
      const mapTime = performance.now() - mapStart;

      // Cleanup
      regularMap.clear();

      return { weakMapTime, mapTime, ratio: mapTime / weakMapTime };
    });
  });

  describe('V8 Engine Performance (Node.js 24 Optimizations)', () => {
    bench('Enhanced async/await performance', async () => {
      const asyncOperations = Array.from({ length: 100 }, async (_, i) => {
        await new Promise((resolve) => setImmediate(resolve));
        return i * 2;
      });

      return Promise.all(asyncOperations);
    });

    bench('Improved Promise.all performance', async () => {
      const promises = Array.from({ length: 1000 }, (_, i) =>
        Promise.resolve(i).then((x) => x * 2)
      );

      return Promise.all(promises);
    });

    bench('Enhanced error handling performance', () => {
      let result = 0;

      for (let i = 0; i < 10000; i++) {
        try {
          if (i % 1000 === 0 && i > 0) {
            throw new Error(`Test error ${i}`);
          }
          result += i;
        } catch (_error) {
          // Node.js 24 has improved error handling performance
          result += 1;
        }
      }

      return result;
    });

    bench('JIT compilation benefits', () => {
      // Function that benefits from JIT optimization
      function complexCalculation(n: number): number {
        let result = 0;
        for (let i = 0; i < n; i++) {
          result += Math.sqrt(i) * Math.sin(i) + Math.cos(i * 2);
        }
        return result;
      }

      // Run multiple times to trigger JIT optimization
      let total = 0;
      for (let i = 0; i < 100; i++) {
        total += complexCalculation(100);
      }

      return total;
    });
  });

  describe('HTTP Performance Improvements', () => {
    bench('URL parsing performance', () => {
      const urls = [
        'https://api.openai.com/v1/chat/completions',
        'https://eastus.api.cognitive.microsoft.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview',
        'https://example.com/path/to/resource?param1=value1&param2=value2#fragment',
        'https://subdomain.example.com:8080/api/v2/users/123?include=profile,settings',
      ];

      return urls.map((url) => {
        const parsed = new URL(url);
        return {
          host: parsed.host,
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
        };
      });
    });

    bench('Headers manipulation performance', () => {
      const headers = new Headers();

      // Add common HTTP headers
      const commonHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
        'User-Agent': 'Claude-to-Azure-Proxy/1.0',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      };

      Object.entries(commonHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      // Add custom headers
      for (let i = 0; i < 50; i++) {
        headers.set(`X-Custom-${i}`, `value-${i}`);
      }

      // Convert to object
      const result: Record<string, string> = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });

      return result;
    });

    bench('JSON serialization/deserialization performance', () => {
      const complexData = {
        messages: Array.from({ length: 10 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `This is message ${i} with some content that simulates real API usage`,
          timestamp: new Date().toISOString(),
          metadata: {
            tokens: Math.floor(Math.random() * 100),
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 1000,
          },
        })),
        configuration: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          stream: false,
          stop: ['\n', '###'],
          presencePenalty: 0.1,
          frequencyPenalty: 0.1,
        },
        metadata: {
          requestId: 'req-123',
          userId: 'user-456',
          timestamp: Date.now(),
          version: '1.0.0',
        },
      };

      // Serialize
      const serialized = JSON.stringify(complexData);

      // Deserialize
      const deserialized = JSON.parse(serialized);

      return {
        originalSize: JSON.stringify(complexData).length,
        deserializedSize: JSON.stringify(deserialized).length,
        equal: JSON.stringify(complexData) === JSON.stringify(deserialized),
      };
    });
  });

  describe('Promise Performance', () => {
    bench('Promise.all with 1000 resolved promises', async () => {
      const promises = Array.from({ length: 1000 }, (_, i) =>
        Promise.resolve(i)
      );
      await Promise.all(promises);
    });

    bench('Promise.allSettled with mixed outcomes', async () => {
      const promises = Array.from({ length: 500 }, (_, i) =>
        i % 2 === 0
          ? Promise.resolve(i)
          : Promise.reject(new Error(`Error ${i}`))
      );
      await Promise.allSettled(promises);
    });

    bench('Nested async/await operations', async () => {
      const nestedOperation = async (depth: number): Promise<number> => {
        if (depth === 0) {
          return 1;
        }
        const result = await nestedOperation(depth - 1);
        return result + 1;
      };

      await nestedOperation(100);
    });
  });

  describe('Memory Operations', () => {
    bench('Array creation and manipulation', () => {
      const arr = new Array(10000);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i * 2;
      }
      return arr.reduce((sum, val) => sum + val, 0);
    });

    bench('Object creation and property access', () => {
      const objects = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: Math.random(),
        nested: {
          data: `nested-${i}`,
          count: i * 2,
        },
      }));

      return objects.reduce((sum, obj) => sum + obj.nested.count, 0);
    });

    bench('Memory snapshot performance', () => {
      takeMemorySnapshot();
    });
  });

  describe('String Operations', () => {
    bench('String concatenation with template literals', () => {
      const parts = Array.from({ length: 1000 }, (_, i) => `part-${i}`);
      return parts.map((part) => `prefix-${part}-suffix`).join('|');
    });

    bench('JSON serialization/deserialization', () => {
      const data = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          tags: [`tag-${i}`, `category-${i % 10}`],
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            version: 1,
          },
        })),
      };

      const serialized = JSON.stringify(data);
      return JSON.parse(serialized);
    });
  });

  describe('Function Call Performance', () => {
    bench('Regular function calls', () => {
      const add = (a: number, b: number) => a + b;
      let result = 0;
      for (let i = 0; i < 10000; i++) {
        result = add(result, i);
      }
      return result;
    });

    bench('Arrow function calls', () => {
      const multiply = (a: number, b: number) => a * b;
      let result = 1;
      for (let i = 1; i <= 100; i++) {
        result = multiply(result, i / 100);
      }
      return result;
    });

    bench('Method calls on objects', () => {
      class Calculator {
        private value = 0;

        add(n: number) {
          this.value += n;
          return this;
        }

        multiply(n: number) {
          this.value *= n;
          return this;
        }

        getValue() {
          return this.value;
        }
      }

      const calc = new Calculator();
      for (let i = 1; i <= 1000; i++) {
        calc.add(i).multiply(0.1);
      }
      return calc.getValue();
    });
  });

  describe('Async Performance', () => {
    bench('setTimeout resolution', async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    bench('setImmediate resolution', async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    bench('process.nextTick resolution', async () => {
      await new Promise((resolve) => process.nextTick(resolve));
    });

    bench('Concurrent async operations', async () => {
      const operations = Array.from({ length: 50 }, async (_, i) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return i * 2;
      });

      return Promise.all(operations);
    });
  });

  describe('Error Handling Performance', () => {
    bench('Try-catch with no errors', () => {
      let result = 0;
      for (let i = 0; i < 1000; i++) {
        try {
          result += i * 2;
        } catch (_error) {
          result = -1;
        }
      }
      return result;
    });

    bench('Try-catch with occasional errors', () => {
      let result = 0;
      for (let i = 0; i < 1000; i++) {
        try {
          if (i % 100 === 0 && i > 0) {
            throw new Error(`Error at ${i}`);
          }
          result += i;
        } catch (_error) {
          result += 1; // Small penalty for error
        }
      }
      return result;
    });
  });

  describe('HTTP-related Performance', () => {
    bench('URL parsing', () => {
      const urls = [
        'https://api.example.com/v1/users?page=1&limit=10',
        'https://cdn.example.com/assets/image.jpg?v=123',
        'https://auth.example.com/oauth/token',
        'https://example.com/path/to/resource#section',
      ];

      return urls.map((url) => new URL(url));
    });

    bench('Headers manipulation', () => {
      const headers = new Headers();

      for (let i = 0; i < 100; i++) {
        headers.set(`x-custom-${i}`, `value-${i}`);
      }

      const result: string[] = [];
      headers.forEach((value, key) => {
        result.push(`${key}: ${value}`);
      });

      return result;
    });
  });

  describe('Memory Management Benchmarks', () => {
    bench('Garbage collection pressure', () => {
      const arrays: number[][] = [];

      // Create memory pressure
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(1000).fill(i));
      }

      // Process and clean up
      const sum = arrays.reduce(
        (total, arr) => total + arr.reduce((s, n) => s + n, 0),
        0
      );

      // Clear arrays to help GC
      arrays.length = 0;

      return sum;
    });

    bench('WeakMap operations', () => {
      const weakMap = new WeakMap();
      const objects = Array.from({ length: 1000 }, () => ({}));

      // Set values
      objects.forEach((obj, i) => {
        weakMap.set(obj, `value-${i}`);
      });

      // Get values
      return objects.map((obj) => weakMap.get(obj));
    });

    bench('WeakSet operations', () => {
      const weakSet = new WeakSet();
      const objects = Array.from({ length: 1000 }, () => ({}));

      // Add objects
      objects.forEach((obj) => weakSet.add(obj));

      // Check membership
      return objects.filter((obj) => weakSet.has(obj));
    });
  });
});
