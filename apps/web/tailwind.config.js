/** @type {import('tailwindcss').Config} */

/*
  PDS tokens are committed as hex (`--accent: #B85D34`), not RGB triplets,
  so Tailwind can't use its default `rgb(... / <alpha>)` substitution to
  apply opacity modifiers. `mix(name)` returns a color callback that
  resolves to the bare var when no opacity is requested, or to a
  `color-mix()` against transparent when an opacity is requested. The
  effect matches `bg-muted/40` semantics across both modes without
  duplicating the token file in RGB form.
*/
const mix =
  (name) =>
  ({ opacityValue } = {}) => {
    // Tailwind passes opacityValue in two shapes:
    //   - undefined / '1' / 'var(--tw-bg-opacity, 1)' for plain utilities.
    //   - a numeric string like '0.4' for the `/N` opacity modifier.
    // Only the numeric form gets a color-mix; everything else collapses to
    // the bare var so plain utilities stay simple.
    const n = Number(opacityValue);
    if (!Number.isFinite(n) || n >= 1) return `var(${name})`;
    return `color-mix(in srgb, var(${name}) ${Math.round(n * 100)}%, transparent)`;
  };

const statusColor = (slug) => ({
  DEFAULT: mix(`--status-${slug}`),
  bg: mix(`--status-${slug}-bg`),
  text: mix(`--status-${slug}-text`),
});

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: mix('--border'),
        input: mix('--input'),
        ring: mix('--ring'),
        background: mix('--background'),
        foreground: mix('--foreground'),
        primary: {
          DEFAULT: mix('--primary'),
          foreground: mix('--primary-foreground'),
          hover: mix('--accent-hover'),
          pressed: mix('--accent-pressed'),
        },
        secondary: {
          DEFAULT: mix('--secondary'),
          foreground: mix('--secondary-foreground'),
        },
        muted: {
          DEFAULT: mix('--muted'),
          foreground: mix('--muted-foreground'),
        },
        accent: {
          DEFAULT: mix('--accent-bg'),
          foreground: mix('--accent-fg'),
        },
        destructive: {
          DEFAULT: mix('--destructive'),
          foreground: mix('--destructive-foreground'),
        },
        card: {
          DEFAULT: mix('--card'),
          foreground: mix('--card-foreground'),
        },
        popover: {
          DEFAULT: mix('--popover'),
          foreground: mix('--popover-foreground'),
        },
        status: {
          critical: statusColor('critical'),
          high: statusColor('high'),
          medium: statusColor('medium'),
          low: statusColor('low'),
          info: statusColor('info'),
        },
      },
      borderRadius: {
        lg: '0.75rem', // 12px for cards
        md: 'var(--radius)', // 8px
        sm: 'calc(var(--radius) - 2px)', // 6px
      },
      borderWidth: {
        DEFAULT: '0.5px',
      },
    },
  },
  plugins: [],
};
