import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f5a8b9',
          400: '#ee7693',
          500: '#e91e63', // Cor principal Apptrix
          600: '#d41d5c',
          700: '#b21650',
          800: '#951548',
          900: '#7f1643',
          950: '#460820',
        },
        dark: {
          50: '#f6f6f7',
          100: '#e2e3e5',
          200: '#c5c6ca',
          300: '#a0a2a8',
          400: '#7b7d85',
          500: '#60626a',
          600: '#4c4d54',
          700: '#3f4046',
          800: '#2d2d31', // Background dark
          900: '#1a1a1d', // Background darker
          950: '#0d0d0e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

export default config
