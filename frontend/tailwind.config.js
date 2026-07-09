/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Berkeley Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#201d1d',
          secondary: '#2a2626',
          dark: '#1a1717',
        },
        text: {
          primary: '#fdfcfc',
          secondary: '#a8a3a3',
        },
        accent: {
          blue: '#007aff',
          red: '#ff3b30',
          green: '#34c759',
          orange: '#ff9500',
        },
        border: '#3a3535',
      },
      spacing: {
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      maxWidth: {
        content: '880px',
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}
