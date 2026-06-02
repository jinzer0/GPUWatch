import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: {
          50: '#f6f7f8',
          100: '#e6e8eb',
          200: '#c9ced5',
          300: '#a6aeb9',
          400: '#7c8796',
          500: '#626d7b',
          600: '#4d5663',
          700: '#3f4651',
          800: '#363b44',
          900: '#30343b',
          950: '#1b1e23'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
