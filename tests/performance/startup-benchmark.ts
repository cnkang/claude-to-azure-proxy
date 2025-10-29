/**
 * Startup Time Benchmark
 * Measures Node.js 24 startup performance improvements
 */

import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

interface StartupMetrics {
  readonly nodeVersion: string;
  readonly startupTime: number;
  readonly moduleLoadTime: number;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly timestamp: string;
}

/**
 * Measure Node.js startup time
 */
async function measureStartupTime(): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    
    const child = spawn(process.execPath, [
      '-e', 
      'console.log("startup-complete")'
    ], {
      stdio: 'pipe'
    });
    
    child.stdout.on('data', (data) => {
      if (data.toString().includes('startup-complete')) {
        const endTime = performance.now();
        child.kill();
        resolve(endTime - startTime);
      }
    });
    
    child.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Startup measurement timeout'));
    }, 10000);
  });
}

/**
 * Measure module loading time
 */
async function measureModuleLoadTime(): Promise<number> {
  const startTime = performance.now();
  
  // Load common modules used by the application
  await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
    import('node:crypto'),
    import('node:util'),
    import('node:stream'),
    import('node:http'),
    import('node:https'),
    import('node:url'),
    import('node:querystring'),
    import('node:buffer')
  ]);
  
  return performance.now() - startTime;
}

/**
 * Measure application-specific startup time
 */
async function measureApplicationStartup(): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    
    const child = spawn(process.execPath, [
      '--enable-source-maps',
      '-e',
      `
        import('./dist/index.js')
          .then(() => {
            console.log('app-ready');
            process.exit(0);
          })
          .catch((error) => {
            console.error('app-error:', error.message);
            process.exit(1);
          });
      `
    ], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    child.stdout.on('data', (data) => {
      if (data.toString().includes('app-ready')) {
        const endTime = performance.now();
        child.kill();
        resolve(endTime - startTime);
      }
    });
    
    child.stderr.on('data', (data) => {
      if (data.toString().includes('app-error')) {
        child.kill();
        reject(new Error(`Application startup failed: ${data.toString()}`));
      }
    });
    
    child.on('error', reject);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Application startup timeout'));
    }, 30000);
  });
}

/**
 * Run comprehensive startup benchmarks
 */
async function runStartupBenchmarks(): Promise<StartupMetrics[]> {
  const results: StartupMetrics[] = [];
  const iterations = 10;
  
  console.log(`Running startup benchmarks (${iterations} iterations)...`);
  console.log(`Node.js version: ${process.version}`);
  
  for (let i = 0; i < iterations; i++) {
    console.log(`Iteration ${i + 1}/${iterations}`);
    
    try {
      const [startupTime, moduleLoadTime] = await Promise.all([
        measureStartupTime(),
        measureModuleLoadTime()
      ]);
      
      const metrics: StartupMetrics = {
        nodeVersion: process.version,
        startupTime,
        moduleLoadTime,
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
      
      results.push(metrics);
      
      // Brief pause between iterations
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Iteration ${i + 1} failed:`, error);
    }
  }
  
  return results;
}

/**
 * Calculate benchmark statistics
 */
function calculateStats(values: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return { mean, median, min, max, stdDev };
}

/**
 * Generate benchmark report
 */
function generateReport(results: StartupMetrics[]): string {
  if (results.length === 0) {
    return 'No benchmark results available';
  }
  
  const startupTimes = results.map(r => r.startupTime);
  const moduleLoadTimes = results.map(r => r.moduleLoadTime);
  const heapUsed = results.map(r => r.memoryUsage.heapUsed);
  
  const startupStats = calculateStats(startupTimes);
  const moduleStats = calculateStats(moduleLoadTimes);
  const memoryStats = calculateStats(heapUsed);
  
  return `
# Node.js Startup Performance Benchmark Report

**Node.js Version:** ${results[0].nodeVersion}
**Test Date:** ${new Date().toISOString()}
**Iterations:** ${results.length}

## Startup Time Performance

- **Mean:** ${startupStats.mean.toFixed(2)}ms
- **Median:** ${startupStats.median.toFixed(2)}ms
- **Min:** ${startupStats.min.toFixed(2)}ms
- **Max:** ${startupStats.max.toFixed(2)}ms
- **Std Dev:** ${startupStats.stdDev.toFixed(2)}ms

## Module Loading Performance

- **Mean:** ${moduleStats.mean.toFixed(2)}ms
- **Median:** ${moduleStats.median.toFixed(2)}ms
- **Min:** ${moduleStats.min.toFixed(2)}ms
- **Max:** ${moduleStats.max.toFixed(2)}ms
- **Std Dev:** ${moduleStats.stdDev.toFixed(2)}ms

## Memory Usage at Startup

- **Mean Heap Used:** ${(memoryStats.mean / 1024 / 1024).toFixed(2)}MB
- **Median Heap Used:** ${(memoryStats.median / 1024 / 1024).toFixed(2)}MB
- **Min Heap Used:** ${(memoryStats.min / 1024 / 1024).toFixed(2)}MB
- **Max Heap Used:** ${(memoryStats.max / 1024 / 1024).toFixed(2)}MB

## Performance Insights

${results[0].nodeVersion.startsWith('v24.') ? 
  '✅ Running on Node.js 24 - Expected performance improvements in startup time and memory efficiency' :
  '⚠️  Not running on Node.js 24 - Consider upgrading for better performance'
}

## Raw Data

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
`;
}

/**
 * Main benchmark execution
 */
async function main(): Promise<void> {
  console.log('Starting Node.js startup performance benchmarks...');

  const results = await runStartupBenchmarks();
  const report = generateReport(results);

  // Save report to file
  const reportPath = 'startup-benchmark-report.md';
  await writeFile(reportPath, report);

  console.log('\n' + report);
  console.log(`\nReport saved to: ${reportPath}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}

export {
  measureStartupTime,
  measureModuleLoadTime,
  measureApplicationStartup,
  runStartupBenchmarks,
  generateReport
};
