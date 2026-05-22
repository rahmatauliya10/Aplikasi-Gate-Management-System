/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#4A8BDF',
          dark: '#3A6ABF',
          light: '#E6F0FA',
          50: '#E6F0FA',
          100: '#CCE0F5',
          200: '#99C1EB',
          400: '#66A2E1',
          500: '#4A8BDF',
          600: '#3A6ABF',
          700: '#2A4A9F',
        },
        accent: {
          DEFAULT: '#A0006D',
          dark: '#800057',
          light: '#F5E6F0',
          neon: '#A0006D',
        },
        cyber: {
          bg: '#EFFAFD',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          border: 'rgba(74,139,223,0.15)',
          glow: 'rgba(74,139,223,0.4)',
        },
        canvas: '#EFFAFD',
        'card-dark': '#FFFFFF',
        'sidebar-dark': '#FFFFFF',
        'text-dark': '#4A8BDF',
        'text-body': '#4A8BDF',
        'border-soft': '#CCE0F5',
        zebra: '#F8FAFC',
      },
      borderRadius: {
        'card': '16px',
        'xl2': '20px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)',
        'card-hover': '0 8px 30px rgba(99,102,241,0.15)',
        'glass': '0 8px 32px rgba(15,23,42,0.08)',
        'inner-soft': 'inset 0 2px 4px rgba(0,0,0,0.04)',
        'glow': '0 0 20px rgba(99,102,241,0.25), 0 0 40px rgba(99,102,241,0.1)',
        'glow-cyan': '0 0 20px rgba(6,182,212,0.35), 0 0 40px rgba(6,182,212,0.15)',
        'glow-emerald': '0 0 20px rgba(16,185,129,0.3), 0 0 40px rgba(16,185,129,0.1)',
        'neon': '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2)',
        'panel': '0 4px 24px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer': 'shimmer 2s infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'scan': 'scan 3s linear infinite',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(99,102,241,0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        fadeInUp: {
          'from': { opacity: '0', transform: 'translateY(16px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          'from': { opacity: '0', transform: 'translateX(20px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          'from': { opacity: '0', transform: 'scale(0.95)' },
          'to': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
