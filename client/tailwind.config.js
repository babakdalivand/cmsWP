/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        'surface-2':'var(--surface-2)',
        border:    'var(--border)',
        text:      'var(--text)',
        'text-muted':'var(--text-muted)',
        label:     'var(--label)',
        blue:      {
          DEFAULT: 'var(--primary)',
          hover:   'var(--primary-hover)',
          soft:    'var(--primary-soft)',
        },
        success:   'var(--success)',
        warning:   'var(--warning)',
        danger:    'var(--danger)',
      },
      boxShadow: {
        soft:      'var(--shadow-soft)',
        'soft-inset':'var(--shadow-inset)',
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      borderRadius: { xl: '16px', '2xl': '20px' },
      backdropBlur: { xs: '4px' },
      animation: {
        'theme-fade': 'themeFade 0.65s ease-in-out',
      },
      keyframes: {
        themeFade: {
          '0%': { opacity: '0' },
          '50%': { opacity: '0.6' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
