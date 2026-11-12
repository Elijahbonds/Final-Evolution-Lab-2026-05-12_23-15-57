import type { Config } from 'tailwindcss';
// A11-06 (2026-10-25): the design tokens' colours as `fel-*` classes (text-fel-dim, bg-fel-bg, border-fel-cyan/45).
import { TAILWIND_FEL } from './lib/design/tokens';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/babylon/ui/* (TouchOverlay, CaptionRegion) and lib/babylon/
    // error-boundary.tsx render real JSX with Tailwind classes but sat
    // outside every scanned glob — any class here that didn't happen to
    // also appear in pages/components/app was silently never generated.
    // The touch controller's own button/stick sizing was hit by exactly
    // this: classNames were correct in source, computed size was not.
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Every whole-percent opacity step, so a colour modifier like `text-white/45` or `border-white/8` compiles.
      // Tailwind 3.3's stock scale is 0, 5, 10, 20, 25, 30, 40 … 100, and a modifier off it emits NO CSS at all:
      // measured 2026-10-14, 70 class names / 912 uses in 222 files compiled to nothing, so that text rendered in
      // its inherited full colour and those tints, borders, scrims and disabled fades were absent. (3.4 adds only
      // the 15/35/… steps; Tailwind 4 takes any integer.) Only classes found in content are emitted, so the unused
      // steps cost nothing, and the stock steps keep their values. tests/tailwind/opacity-scale.test.ts holds it.
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)])),
      // FONTS-FIX (lane/premium-ui P2, 2026-10-27): every face's var() carries its own fallback. `var(--font-sans), system-ui`
      // with the variable missing is not "skip to system-ui": the whole declaration is invalid at computed-value time and the
      // text falls back to the BROWSER DEFAULT, a serif. Production sets the variables on <html> (app/layout.tsx), so it
      // never showed there; every rig without them (the probes) and the root crash screen, which renders its own <html>,
      // drew in Times. With the fallback inside var(), a missing variable means the system sans. lib/design/fonts.test.ts.
      fontFamily: {
        sans: ['var(--font-sans, ui-sans-serif)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display, var(--font-sans, ui-sans-serif))', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono, ui-monospace)', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        fel: TAILWIND_FEL,
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
      },
      // The spacing scale on min-height / min-width, as Tailwind 3.4 has it, so `min-h-12` (48 px touch targets) compiles.
      // 3.3's stock min-h/min-w only know 0, full, screen, min, max, fit, and the rest compiled to NO CSS: measured
      // 2026-10-16, min-h-12 ×57, min-w-12 ×8, min-h-14 ×6 … 79 uses. Extended, so min-h-full / min-h-screen are unchanged.
      // tests/tailwind/dead-classes.test.ts holds it.
      minHeight: ({ theme }) => theme('spacing'),
      minWidth: ({ theme }) => theme('spacing'),
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
