/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'veil-purple': '#8b5cf6',
        'veil-indigo': '#6366f1',
        'veil-dark': '#0f172a',
        'veil-accent': '#a855f7',
      },
    },
  },
  plugins: [],
}