import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';

  return {
    plugins: [
      react({
        // Production optimizations
        babel: isProduction
          ? {
              plugins: [
                [
                  'babel-plugin-react-remove-properties',
                  { properties: ['data-testid'] },
                ],
              ],
            }
          : undefined,
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        'jest-axe': resolve(__dirname, './src/test/utils/jest-axe.ts'),
      },
    },
    define: {
      // Expose environment variables to the client
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || '2.0.0'
      ),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __COMMIT_HASH__: JSON.stringify(process.env.COMMIT_HASH || 'unknown'),
    },
    build: {
      outDir: 'dist',
      sourcemap: isProduction ? false : true, // Disable sourcemaps in production for security
      target: 'es2022',
      minify: 'terser',
      cssMinify: true,
      reportCompressedSize: false, // Disable for faster builds
      chunkSizeWarningLimit: 1000,
      assetsInlineLimit: 4096, // Inline assets smaller than 4kb
      // Production-specific optimizations
      emptyOutDir: true,
      copyPublicDir: true,
      write: true,
      // Advanced build optimizations
      modulePreload: {
        polyfill: false, // Disable polyfill for modern browsers
      },
      rollupOptions: {
        output: {
          // Optimized chunking strategy for CDN caching
          manualChunks: (id) => {
            // Vendor chunks for better caching
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('react-router')) {
                return 'router';
              }
              if (id.includes('i18next') || id.includes('react-i18next')) {
                return 'i18n';
              }
              if (id.includes('prismjs')) {
                return 'prism';
              }
              if (id.includes('react-window')) {
                return 'virtualization';
              }
              // Other vendor libraries
              return 'vendor';
            }
            // App chunks
            if (id.includes('/src/components/')) {
              return 'components';
            }
            if (id.includes('/src/hooks/') || id.includes('/src/contexts/')) {
              return 'hooks';
            }
            if (id.includes('/src/utils/') || id.includes('/src/services/')) {
              return 'utils';
            }
            // Default chunk
            return 'index';
          },
          // CDN-friendly file naming with better cache busting
          entryFileNames: (chunkInfo) => {
            return isProduction
              ? 'assets/js/[name]-[hash].js'
              : 'assets/js/[name].js';
          },
          chunkFileNames: (chunkInfo) => {
            return isProduction
              ? 'assets/js/[name]-[hash].js'
              : 'assets/js/[name].js';
          },
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name?.split('.') || [];
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(ext)) {
              return isProduction
                ? 'assets/images/[name]-[hash].[ext]'
                : 'assets/images/[name].[ext]';
            }
            if (/css/i.test(ext)) {
              return isProduction
                ? 'assets/css/[name]-[hash].[ext]'
                : 'assets/css/[name].[ext]';
            }
            if (/woff2?|eot|ttf|otf/i.test(ext)) {
              return isProduction
                ? 'assets/fonts/[name]-[hash].[ext]'
                : 'assets/fonts/[name].[ext]';
            }
            return isProduction
              ? 'assets/misc/[name]-[hash].[ext]'
              : 'assets/misc/[name].[ext]';
          },
        },
        // Tree shaking optimizations
        treeshake: isProduction
          ? {
              moduleSideEffects: false,
              propertyReadSideEffects: false,
              unknownGlobalSideEffects: false,
            }
          : false,
      },
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true, // Remove console.log in production
              drop_debugger: true,
              pure_funcs: [
                'console.log',
                'console.info',
                'console.debug',
                'console.warn',
              ],
              passes: 3, // Multiple passes for better compression
              unsafe: true, // Enable unsafe optimizations for better compression
              unsafe_comps: true,
              unsafe_Function: true,
              unsafe_math: true,
              unsafe_symbols: true,
              unsafe_methods: true,
              unsafe_proto: true,
              unsafe_regexp: true,
              unsafe_undefined: true,
              dead_code: true,
              global_defs: {
                '@console.log': 'void',
                '@console.info': 'void',
                '@console.debug': 'void',
                '@console.warn': 'void',
              },
            },
            mangle: {
              safari10: true,
              toplevel: true,
              properties: {
                regex: /^_/,
              },
            },
            format: {
              comments: false,
              ascii_only: true, // Ensure ASCII-only output for better compatibility
            },
          }
        : {},
    },
    server: {
      port: 3000,
      host: true, // Allow external connections
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 3000,
      host: true,
    },
    // Production optimizations
    esbuild: isProduction
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
          minifyIdentifiers: true,
          minifySyntax: true,
          minifyWhitespace: true,
          treeShaking: true,
          // Advanced esbuild optimizations
          pure: [
            'console.log',
            'console.info',
            'console.debug',
            'console.warn',
          ],
          ignoreAnnotations: false,
          keepNames: false,
        }
      : {},
    // CSS optimization
    css: {
      devSourcemap: !isProduction,
      postcss: {
        plugins: isProduction
          ? [
              autoprefixer(),
              cssnano({
                preset: [
                  'default',
                  {
                    discardComments: { removeAll: true },
                    normalizeWhitespace: true,
                    reduceIdents: false, // Keep CSS custom properties
                    zindex: false, // Don't optimize z-index values
                  },
                ],
              }),
            ]
          : [],
      },
    },
    // Experimental features for better performance
    experimental: {
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === 'js') {
          // Use CDN URL for assets in production if configured
          const cdnUrl = env.VITE_CDN_URL;
          if (isProduction && cdnUrl) {
            return `${cdnUrl}/${filename}`;
          }
        }
        return { relative: true };
      },
    },
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'i18next',
        'react-i18next',
        'i18next-browser-languagedetector',
      ],
      exclude: ['@repo/shared-types', '@repo/shared-utils'],
    },
  };
});
