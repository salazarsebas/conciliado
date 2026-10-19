import brandTheme from './docs/brand/tailwind.tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: brandTheme,
  },
  plugins: [],
};
