/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * MONOCHROME ACCENT
         *
         * These names are kept because ~265 class usages reference them; only
         * the values changed. Hue is now reserved entirely for meaning — the
         * resilience tiers (emerald / cyan / amber / orange / rose) are the only
         * coloured things in the interface, so colour always signals status and
         * never decoration.
         *
         * The names no longer describe their values. Renaming them across 50
         * files is a separate, riskier change; the values are the contract.
         *
         * Affordance without hue comes from two devices:
         *   · primary actions invert  — light surface, dark text
         *   · links underline         — they cannot rely on colour alone
         */

        // Base accent. Light on the dark ground, so anything filled with it
        // needs dark text — see `text-veil-on-accent`.
        'veil-purple': '#f1f5f9',   // slate-100

        // Hover for both fills and text. Every one of the 36 `veil-indigo`
        // usages is a hover state, so this only ever needs to read brighter.
        'veil-indigo': '#ffffff',
        'veil-accent': '#ffffff',

        // Text that sits on top of a veil-purple fill.
        'veil-on-accent': '#0f172a', // slate-900

        // Page ground, unchanged.
        'veil-dark': '#0f172a',
      },
    },
  },
  plugins: [],
};
