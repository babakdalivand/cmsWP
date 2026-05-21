/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0B0B0C',
        surface:  '#161618',
        border:   '#1E1E21',
        blue:     { DEFAULT: '#0066FF', hover: '#0052CC', light: '#1A75FF' },
        label:    '#8E8E93',
        success:  '#34C759',
        warning:  '#FF9500',
        danger:   '#FF3B30',
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      borderRadius: { xl: '16px', '2xl': '20px' },
      backdropBlur: { xs: '4px' },
    },
  },
  plugins: [],
};
