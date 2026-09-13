/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {
    // styles.css already defines the reset, box-sizing, and base typography
    // for this app — Tailwind's own Preflight reset would fight it (double
    // margin resets, conflicting font stacks). Utilities still work fine
    // with Preflight off; only the opinionated "zero everything out" layer
    // is skipped.
    preflight: false,
  },
  theme: {
    extend: {
      // Mirrors the CSS custom properties in styles.css so Tailwind
      // utilities (bg-app-accent, text-app-muted, etc.) stay in sync with
      // the existing design system instead of introducing a second,
      // competing palette.
      colors: {
        'app-bg': 'var(--bg)',
        'app-bg-elevated': 'var(--bg-elevated)',
        'app-bg-elevated-2': 'var(--bg-elevated-2)',
        'app-surface': 'var(--surface)',
        'app-border': 'var(--border)',
        'app-border-strong': 'var(--border-strong)',
        'app-text': 'var(--text)',
        'app-muted': 'var(--text-muted)',
        'app-faint': 'var(--text-faint)',
        'app-accent': 'var(--accent)',
        'app-accent-strong': 'var(--accent-strong)',
        'app-ok': 'var(--ok)',
        'app-warn': 'var(--warn)',
        'app-danger': 'var(--danger)',
      },
      borderRadius: {
        'app-sm': 'var(--radius-sm)',
        'app-md': 'var(--radius-md)',
        'app-lg': 'var(--radius-lg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
