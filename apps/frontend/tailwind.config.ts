import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        glass: {
          '100': 'rgba(255, 255, 255, 0.1)',
          '200': 'rgba(255, 255, 255, 0.2)',
          '300': 'rgba(255, 255, 255, 0.3)',
          border: 'rgba(255, 255, 255, 0.2)',
        },
        gray: {
          '50': '#F9FAFB',
          '100': '#F3F4F6',
          '200': '#E5E7EB',
          '300': '#919191',
          '400': '#9CA3AF',
          '500': '#6B7280',
          '600': '#5A5A5A',
          '700': '#333333',
          '800': '#1F2937',
          '900': '#000000',
        },
        blue: {
          '50': '#EFF6FF',
          '100': '#DBEAFE',
          '200': '#66B3FF',
          '300': '#93C5FD',
          '400': '#60A5FA',
          '500': '#3B82F6',
          '600': '#2563EB',
          '700': '#0050B4',
          '800': '#1E40AF',
          '900': '#1E3A8A',
        },
        red: {
          '50': '#FEF2F2',
          '100': '#FEE2E2',
          '200': '#FF6666',
          '300': '#FCA5A5',
          '400': '#F87171',
          '500': '#EF4444',
          '600': '#DC2626',
          '700': '#AA0000',
          '800': '#991B1B',
          '900': '#7F1D1D',
        },
        green: {
          '50': '#F0FDF4',
          '100': '#DCFCE7',
          '200': '#66FF66',
          '300': '#86EFAC',
          '400': '#4ADE80',
          '500': '#22C55E',
          '600': '#16A34A',
          '700': '#006400',
          '800': '#166534',
          '900': '#14532D',
        },
        yellow: {
          '50': '#FEFCE8',
          '100': '#FEF9C3',
          '200': '#FFCC66',
          '300': '#FDE047',
          '400': '#FACC15',
          '500': '#EAB308',
          '600': '#CA8A04',
          '700': '#784F00',
          '800': '#854D0E',
          '900': '#713F12',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
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
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
