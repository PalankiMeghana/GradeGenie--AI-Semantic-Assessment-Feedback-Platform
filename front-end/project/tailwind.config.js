/** @type {import('tailwindcss').Config} */
// tailwind.config.js
export default {
  prefix: 'tw-', // ✅ isolates Tailwind utility classes
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: { /* your config */ 
 
animation: {
        float: 'float 6s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 5px #00E5FF' },
          '50%': { boxShadow: '0 0 20px #00E5FF' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.2' },
          '50%': { opacity: '1' },
        },
      },
      colors: {
        primary: {
          50: '#EEF1FC',
          100: '#D0D9F5',
          200: '#A1B3EB',
          300: '#738DE1',
          400: '#5672D8',
          500: '#3A5CCC',
          600: '#2C49A3',
          700: '#1F357A',
          800: '#132252',
          900: '#060E29',

        },
        secondary: {
          50: '#FFF0EB',
          100: '#FFD6C7',
          200: '#FFAD8F',
          300: '#FF8F65',
          400: '#FF7D4D',
          500: '#FF6B35',
          600: '#E04F1A',
          700: '#B33D12',
          800: '#7F2A0B',
          900: '#4C1805',
        },
        accent: {
          50: '#EDFAF9',
          100: '#C7F1ED',
          200: '#8FE3DB',
          300: '#65D9CA',
          400: '#4ECDC4',
          500: '#31B3AA',
          600: '#258F87',
          700: '#196B65',
          800: '#0D4742',
          900: '#042320',
        },
        success: {
          500: '#4ADE80',
        },
        warning: {
          500: '#FACC15',
        },
        error: {
          500: '#F87171',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'slide-left': 'slideLeft 0.5s ease-out',
        'slide-right': 'slideRight 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};