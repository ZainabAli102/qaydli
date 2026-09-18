import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // System stack first; Arabic/Kurdish glyphs fall back to installed fonts.
        sans: ['system-ui', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#0f766e',
          dark: '#115e59',
        },
      },
    },
  },
  plugins: [],
};

export default config;
