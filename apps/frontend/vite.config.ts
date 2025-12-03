import { resolve } from 'node:path';
import react from '@vitejs/plugin-react-swc';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';

  return {
    plugins: [
      react({
        // SWC plugin configuration
        // Automatically handles JSX transformation and React refresh
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
      sourcemap: !isProduction, // Disable sourcemaps in production for security
      target: 'baseline-widely-available', // Vite 7 default: Chrome 107+, Edge 107+, Firefox 104+, Safari 16+
      minify: isProduction ? 'terser' : false, // Use terser for production builds
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
          // Optimized chunking strategy with proper vendor splitting
          manualChunks: (id) => {
            // Vendor chunks for better caching
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('react-router')) {
                return 'vendor';
              }
              if (id.includes('react-window')) {
                return 'vendor';
              }
              // Only create i18n chunk if there are actual i18n modules
              if (id.includes('i18next') || id.includes('react-i18next')) {
                return 'vendor';
              }
              // Other vendor libraries
              return 'vendor';
            }
            // App chunks - only create if there's substantial content
            if (id.includes('/src/components/') && !id.includes('.test.')) {
              return 'components';
            }
            if (id.includes('/src/utils/') || id.includes('/src/hooks/')) {
              return 'utils';
            }
            // Return undefined for other files to let Vite handle them
            return undefined;
          },
          // CDN-friendly file naming with better cache busting
          entryFileNames: () => {
            return isProduction
              ? 'assets/js/[name]-[hash].js'
              : 'assets/js/[name].js';
          },
          chunkFileNames: () => {
            return isProduction
              ? 'assets/js/[name]-[hash].js'
              : 'assets/js/[name].js';
          },
          assetFileNames: (assetInfo) => {
            const fileName = assetInfo.names?.[0] || assetInfo.name || '';
            const info = fileName.split('.');
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
        // Enhanced tree shaking optimizations
        treeshake: isProduction
          ? {
              moduleSideEffects: (id) => {
                // Keep side effects for CSS and certain modules
                return id.includes('.css') || id.includes('polyfill');
              },
              propertyReadSideEffects: false,
              unknownGlobalSideEffects: false,
              preset: 'smallest',
            }
          : false,
      },
      // Terser configuration for production builds with proper tree shaking
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
              passes: 2, // Multiple passes for better compression
              dead_code: true,
              // Essential optimizations for tree shaking
              collapse_vars: true,
              conditionals: true,
              evaluate: true,
              if_return: true,
              join_vars: true,
              loops: true,
              properties: true,
              reduce_funcs: true,
              reduce_vars: true,
              sequences: true,
              switches: true,
              typeofs: true,
              unused: true,
              // Safe settings to avoid compatibility issues
              unsafe: false,
              unsafe_arrows: false,
              unsafe_comps: false,
              unsafe_Function: false,
              unsafe_math: false,
              unsafe_symbols: false,
              unsafe_methods: false,
              unsafe_proto: false,
              unsafe_regexp: false,
              unsafe_undefined: false,
            },
            mangle: {
              safari10: true, // Keep for compatibility
              toplevel: false, // Safer for module systems
              properties: false, // Don't mangle properties to avoid issues
            },
            format: {
              comments: false,
              safari10: true, // Keep for compatibility
            },
            // Module and safety settings
            module: true,
            toplevel: false,
            ie8: false,
            keep_classnames: false,
            keep_fnames: false,
            safari10: true, // Keep for compatibility
          }
        : undefined,
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
    // SWC handles transpilation, esbuild still used for dependency pre-bundling
    // Production optimizations handled by terser and SWC
    // CSS optimization
    css: {
      devSourcemap: !isProduction,
      postcss: './postcss.config.js', // Use PostCSS config file
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
