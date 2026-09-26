/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      fontFamily: {
        sans: 'var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)',
        serif: 'var(--font-serif, Georgia, ui-serif, serif)'
      },
      height: {
        control: 'var(--control-h-md)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
        row: 'var(--row-h)',
        header: 'var(--header-h)'
      },
      width: {
        control: 'var(--control-h-md)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)'
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        spring: 'var(--ease-spring)'
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)'
      },
      fontSize: {
        caption: ['0.8125rem', { lineHeight: '1.125rem' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        subtitle: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        title: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em' }]
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
          muted: 'hsl(var(--sidebar-muted))'
        },
        titlebar: {
          DEFAULT: 'hsl(var(--titlebar))'
        },
        voice: {
          active: 'hsl(var(--voice-active))',
          thinking: 'hsl(var(--voice-thinking))',
          speaking: 'hsl(var(--voice-speaking))',
          idle: 'hsl(var(--voice-idle))',
          glow: 'hsl(var(--voice-glow))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(31 30 29 / 0.04)',
        DEFAULT: '0 1px 2px 0 rgb(31 30 29 / 0.05), 0 1px 3px 0 rgb(31 30 29 / 0.05)',
        md: '0 2px 4px -1px rgb(31 30 29 / 0.06), 0 4px 8px -2px rgb(31 30 29 / 0.08)',
        lg: '0 4px 6px -2px rgb(31 30 29 / 0.05), 0 12px 16px -4px rgb(31 30 29 / 0.10)',
        float:
          '0 8px 24px -6px rgb(31 30 29 / 0.12), 0 2px 8px -2px rgb(31 30 29 / 0.08), 0 0 0 1px rgb(31 30 29 / 0.04)',
        glow: '0 8px 30px -8px hsl(var(--primary) / 0.25)',
        soft: '0 1px 2px 0 rgb(31 30 29 / 0.04)',
        card: '0 1px 2px 0 rgb(31 30 29 / 0.04), 0 1px 3px 0 rgb(31 30 29 / 0.06)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'orb-breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.45' },
          '50%': { transform: 'scale(1.06)', opacity: '0.8' }
        },
        'orb-think': {
          to: { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down var(--duration-base) var(--ease-out)',
        'accordion-up': 'accordion-up var(--duration-base) var(--ease-out)',
        'fade-in': 'fade-in var(--duration-base) var(--ease-out)',
        'slide-in': 'slide-in var(--duration-base) var(--ease-spring)',
        'orb-breathe': 'orb-breathe 3.6s ease-in-out infinite',
        'orb-think': 'orb-think 2.8s linear infinite'
      }
    }
  },
  plugins: []
}
