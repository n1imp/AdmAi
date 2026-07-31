import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

const vitestGlobals = {
  describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
  beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
  vi: 'readonly',
};

export default [
  // Ignora o que NÃO é código-fonte do painel: deps, build, e os bundles minificados
  // que o `cap:sync` copia para android/ (senão o eslint "linta" o output do Vite).
  // public/sw.js é service worker (globais próprios) e assets/ são fontes de ícone.
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'android/**', 'public/sw.js', 'assets/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Sem estas duas, o ESLint não enxerga que um identificador é usado DENTRO do JSX:
      // `no-unused-vars` acusava praticamente todo componente e ícone importado, gerando
      // ~597 falsos positivos. O ruído enterrava o sinal real — inclusive imports mortos
      // de verdade, que é exatamente o tipo de pista que revelou bugs no backend.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Lenient: warnings não quebram o CI; rules-of-hooks segue como erro (bug real).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-irregular-whitespace': 'warn',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', '**/__tests__/**', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...vitestGlobals } },
  },
  {
    // Scripts Node ESM puros, fora do bundle do painel — globais do Node + WebSocket/fetch.
    // Cobre o harness e2e e os scripts de build (ex.: scripts/gerar-headers.mjs).
    files: ['e2e/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, WebSocket: 'readonly', fetch: 'readonly' },
    },
  },
];
