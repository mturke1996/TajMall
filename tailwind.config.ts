import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      fontFamily: {
        // Arabic body & UI (editorial sans)
        sans: ['var(--font-arabic)', 'var(--font-latin)', 'system-ui', 'sans-serif'],
        // Latin display serif for the brand mark and English headings
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        // Monospace for numbers, refs, codes
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        /**
         * Editorial warm palette
         * Inspired by the legacy "تاج مول" workbook (sage + cream)
         * Tinted neutrals — never absolute #fff or #000.
         */
        canvas: {
          DEFAULT: '#FBFBFA', // warm off-white
          raised:  '#FFFFFF',
          sunken:  '#F5F4EF',
        },
        ink: {
          DEFAULT: '#15171A', // warm near-black
          soft:    '#3A3F3A',
          mute:    '#6E7470',
          line:    '#ECEAE3',
          subtle:  '#F2F0E9',
        },
        // Single restrained brand accent — deep sage (taken from legacy palette)
        sage: {
          50:  '#F2F4F0',
          100: '#E2E7DE',
          200: '#C2CCBA',
          300: '#9CAB91',
          400: '#74866A',
          500: '#536647',
          600: '#3E4D34',
          700: '#2F3D27',
          800: '#243020',
          900: '#1B241A',
        },
        // Warm tan secondary tone
        sand: {
          50:  '#FBF8F1',
          100: '#F4EEDD',
          200: '#E8DEC2',
          300: '#D7C699',
          400: '#C5B07A',
          500: '#A89253',
          600: '#8B7943',
          700: '#6E6035',
        },
        // Muted pastels for badges & tags (editorial)
        pastel: {
          green:    '#EDF3EC',
          greenInk: '#2F5234',
          red:      '#FBEDEC',
          redInk:   '#8A2F2D',
          blue:     '#E7F0F7',
          blueInk:  '#1F4F73',
          yellow:   '#F8F1DA',
          yellowInk:'#7A5C0F',
          plum:     '#F1E9F1',
          plumInk:  '#5E3A66',
        },
      },
      boxShadow: {
        // Almost invisible elevations only
        hairline: '0 0 0 1px hsl(var(--border))',
        whisper:  '0 1px 1px rgba(20, 22, 25, 0.025), 0 0 0 1px hsl(var(--border))',
        lift:     '0 1px 2px rgba(20, 22, 25, 0.04), 0 8px 24px -16px rgba(20, 22, 25, 0.06)',
        focus:    '0 0 0 3px rgba(83, 102, 71, 0.12)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': 'calc(var(--radius) + 6px)',
        '3xl': 'calc(var(--radius) + 12px)',
      },
      letterSpacing: {
        tightest: '-0.045em',
        tight:    '-0.02em',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%':      { transform: 'translate3d(0, -4px, 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer:   'shimmer 1.8s linear infinite',
        drift:     'drift 16s ease-in-out infinite',
      },
      transitionTimingFunction: {
        // Emil-grade curves
        'out-quart':  'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-quint':  'cubic-bezier(0.22, 1, 0.36, 1)',
        'out-expo':   'cubic-bezier(0.16, 1, 0.3, 1)',
        'drawer':     'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
