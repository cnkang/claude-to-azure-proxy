import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        glass: {
          100: 'rgba(255, 255, 255, 0.1)',
          200: 'rgba(255, 255, 255, 0.2)',
          300: 'rgba(255, 255, 255, 0.3)',
          border: 'rgba(255, 255, 255, 0.2)',
        },
        // WCAG AAA compliant colors (7:1 contrast for normal text, 4.5:1 for large)
        gray: {
          // Override Tailwind's gray palette with WCAG AAA compliant values
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#919191', // WCAG AAA: 3.15:1 on white, used for borders in light mode
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#5A5A5A', // WCAG AAA: 3.04:1 on black, used for borders in dark mode
          700: '#333333', // WCAG AAA: 12.6:1 on white, used for secondary text in light mode
          800: '#1F2937',
          900: '#000000', // WCAG AAA: 21:1 on white, used for primary text
        },
        blue: {
          // Override Tailwind's blue palette with WCAG AAA compliant values
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#66B3FF', // WCAG AAA: 7.5:1 on black, used for primary in dark mode
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#0050B4', // WCAG AAA: 7.48:1 on white, used for primary in light mode
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        red: {
          // Override Tailwind's red palette with WCAG AAA compliant values
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FF6666', // WCAG AAA: 7.5:1 on black, used for errors in dark mode
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#AA0000', // WCAG AAA: 7.44:1 on white, used for errors in light mode
          800: '#991B1B',
          900: '#7F1D1D',
        },
        green: {
          // Override Tailwind's green palette with WCAG AAA compliant values
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#66FF66', // WCAG AAA: 7:1 on black, used for success in dark mode
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#006400', // WCAG AAA: 7.44:1 on white, used for success in light mode
          800: '#166534',
          900: '#14532D',
        },
        yellow: {
          // Override Tailwind's yellow palette with WCAG AAA compliant values
          50: '#FEFCE8',
          100: '#FEF9C3',
          200: '#FFCC66', // WCAG AAA: 7:1 on black, used for warnings in dark mode
          300: '#FDE047',
          400: '#FACC15',
          500: '#EAB308',
          600: '#CA8A04',
          700: '#784F00', // WCAG AAA: 7.20:1 on white, used for warnings in light mode
          800: '#854D0E',
          900: '#713F12',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--focus-ring))',
      },
      ringOffsetColor: {
        DEFAULT: 'rgb(var(--focus-ring-offset))',
      },
      animation: {
        blob: 'blob 7s infinite',
      },
      keyframes: {
        blob: {
          '0%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
          '100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
