/** @type {import('tailwindcss').Config} */
// Tokens mirror rx-tracker-web/app/globals.css (@theme) and DESIGN.md.
// Web runs Tailwind v4 and this app runs v3 (NativeWind 4), so keep the two
// in sync by hand — class names (bg-brand-bg, rounded-card, ...) are shared.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: '#14CFE0',
          blue: '#0A8AC8',
          'deep-blue': '#0754A8',
          navy: '#102B57',
          'dark-navy': '#071D3D',
          bg: '#EAF4FF',
          card: '#FFFFFF',
          border: '#D7E6F8',
          text: '#172033',
          'text-muted': '#60708A',
          purple: '#8B5CF6',
        },
        // Dark-mode surfaces (mobile only; web is light-only). Mirrors
        // Colors.dark in src/constants/theme.ts.
        night: {
          bg: '#000000',
          card: '#212225',
          selected: '#2E3135',
          border: '#3A3E44',
          muted: '#B0B4BA',
        },
        status: {
          success: '#18BFA6',
          warning: '#F5A524',
          danger: '#E5484D',
        },
      },
      borderRadius: {
        control: '10px',
        card: '18px',
        hero: '28px',
      },
      boxShadow: {
        card: '0 18px 45px rgba(7, 29, 61, 0.14)',
      },
    },
  },
  plugins: [],
};
