module.exports = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {

    preflight: false,
  },
  theme: {
    extend: {

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
