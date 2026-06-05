/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Display: condensada técnica — KPIs, títulos, números
        display: ['"Saira Condensed"', '"Oswald"', 'system-ui', 'sans-serif'],
        // Corpo: sans neutra de boa legibilidade
        body: ['"Sora"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        // Monoespaçada técnica — códigos, IDs, métricas finas
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ── Tema Industrial Técnico: grafite/carvão ──────────────────────────
        // Mantém os nomes "dark-*" usados nas páginas, mas com novos valores.
        dark: {
          950: '#0A0C10', // fundo mais profundo
          900: '#0E1014', // body bg
          800: '#15181F', // cards / superfícies
          700: '#1C2027', // elementos elevados / inputs
          600: '#262B34', // bordas
          500: '#333A45', // bordas hover / divisores fortes
        },
        // Acento ciano-elétrico (substitui o âmbar). "amber" vira ALIAS de accent
        // para não quebrar páginas legadas durante a migração por ondas.
        accent: {
          300: '#67E8F9',
          400: '#22D3EE', // primário
          500: '#06B6D4',
          600: '#0E7490', // pressed
        },
        amber: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0E7490',
        },
        success: '#34D399',
        danger: '#F87171',
        warning: '#FBBF24',
        muted: '#9AA3B2',
      },
      boxShadow: {
        // Sombra técnica difusa + halo de acento para foco
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(34,211,238,0.4), 0 0 20px -4px rgba(34,211,238,0.35)',
      },
      backgroundImage: {
        // Grade técnica sutil para fundos de painel
        grid: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'rise': 'rise 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};
