import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

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
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
