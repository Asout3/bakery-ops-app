import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff6ed',
          100: '#fde4cf',
          200: '#f9c79f',
          300: '#f4a261',
          400: '#e8854a',
          500: '#d97234',
          600: '#b95b28',
          700: '#91451f',
          800: '#6e3419',
          900: '#4f2512',
        },
      },
      fontFamily: {
        sans: ['Manrope', ...defaultTheme.fontFamily.sans],
        display: ['Fraunces', ...defaultTheme.fontFamily.serif],
      },
      boxShadow: {
        soft: '0 10px 26px rgba(95,58,36,0.12)',
        float: '0 18px 40px rgba(95,58,36,0.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.2, 0.9, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

